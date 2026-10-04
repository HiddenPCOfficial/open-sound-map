import { editDuration } from '../lib/mp3';
import { resumePlayback } from '../lib/audio';
import { DEFAULT_SCALE, getNote, NoteLimiter, type ScaleId } from '../lib/music';
import type { WikiEvent } from '../types/wiki';
import * as Tone from 'tone';

/** Owns audio resources outside React; Tone.js synthesizes map edits while samples handle welcomes/music. */
export class AudioEngine {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private toneGain: Tone.Gain | null = null;
  private addSynth: Tone.PolySynth<Tone.Synth> | null = null;
  private removeSynth: Tone.PolySynth<Tone.Synth> | null = null;
  private toneReverb: Tone.Reverb | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private active = new Set<AudioScheduledSourceNode>();
  private loading: Promise<void> | null = null;
  private abort = new AbortController();
  private disposed = false;
  private limiter = new NoteLimiter();
  private toneContext: ReturnType<typeof Tone.getContext> | null = null;
  constructor(private onInterrupted: () => void = () => {}) {}
  private checkPlayback = (): void => {
    if (!this.disposed && !this.isRunning()) this.onInterrupted();
  };
  isRunning(): boolean {
    return this.context?.state === 'running' && (!this.toneContext || this.toneContext.state === 'running');
  }

  private songUrl: string | null = null;
  private songCache = new Map<string, AudioBuffer>();
  private songCursors = new Map<string, number>();
  private songLoading = false;
  private song: AudioBuffer | null = null;
  private segment: AudioBufferSourceNode | null = null;
  private cursor = 0;
  private segmentStarted = 0;
  private segmentOffset = 0;
  private songRequest = 0;
  private minSeconds = 0.5;
  private maxSeconds = 5;

  setSegmentRange(min: number, max: number): void { this.minSeconds = min; this.maxSeconds = max; }
  stopSegment(): void {
    if (this.segment && this.context && this.song) {
      this.cursor = (this.segmentOffset + this.context.currentTime - this.segmentStarted) % this.song.duration;
      this.segment.stop();
      this.segment = null;
    }
  }
  async selectSong(url: string | null): Promise<void> {
    const request = ++this.songRequest;
    this.stopSegment();
    if (this.songUrl) this.songCursors.set(this.songUrl, this.cursor);
    this.songUrl = url;
    this.song = null;
    this.cursor = 0;
    this.songLoading = Boolean(url);
    if (!url) return;
    try {
    await this.enable();
    let buffer = this.songCache.get(url);
    if (!buffer) {
    const response = await fetch(url, { signal: this.abort.signal });
    if (!response.ok) throw new Error('Impossibile caricare il brano');
    buffer = await this.context!.decodeAudioData(await response.arrayBuffer());
    if (!this.disposed) this.songCache.set(url, buffer);
    }
    if (request !== this.songRequest || this.disposed) return;
    for (const source of this.active) source.stop();
    this.song = buffer;
    this.cursor = this.songCursors.get(url) ?? 0;
    } finally { if (request === this.songRequest) this.songLoading = false; }
  }
  async playLocation(event: WikiEvent, url: string | null, scale: ScaleId): Promise<void> {
    // Let the current segment finish before changing countries; never queue edits.
    if (this.segment || this.songLoading || !this.context || this.context.state !== 'running') return;
    if (this.songUrl !== url) await this.selectSong(url);
    if (this.songUrl === url && !this.disposed) this.play(event, scale);
  }
  private playSegment(bytes: number): void {
    if (!this.context || !this.gain || !this.song || this.segment) return;
    const now = this.context.currentTime;
    const duration = Math.min(editDuration(bytes, this.minSeconds, this.maxSeconds), this.song.duration - this.cursor);
    const source = this.context.createBufferSource();
    const envelope = this.context.createGain();
    source.buffer = this.song;
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(1, now + Math.min(0.02, duration / 4));
    envelope.gain.setValueAtTime(1, now + Math.max(duration / 2, duration - 0.04));
    envelope.gain.linearRampToValueAtTime(0, now + duration);
    source.connect(envelope).connect(this.gain);
    this.segment = source;
    this.segmentStarted = now;
    this.segmentOffset = this.cursor;
    source.onended = () => {
      if (this.segment === source) {
        this.cursor = (this.segmentOffset + duration) % this.song!.duration;
        if (this.song!.duration - this.cursor < 0.01) this.cursor = 0;
        this.segment = null;
      }
      source.disconnect(); envelope.disconnect();
    };
    source.start(now, this.cursor, duration);
  }

  async enable(): Promise<void> {
    if (this.disposed) throw new Error('Audio engine disposed');
    if (!this.context) {
      this.context = new AudioContext();
      this.gain = this.context.createGain();
      this.gain.gain.value = 0.5;
      this.gain.connect(this.context.destination);
      this.context.addEventListener('statechange', this.checkPlayback);
    }
    if (typeof window !== 'undefined' && !this.toneContext) {
      this.toneContext = Tone.getContext();
      this.toneContext.on('statechange', this.checkPlayback);
    }
    await resumePlayback(
      this.toneContext ? [this.context, this.toneContext] : [this.context],
      typeof navigator !== 'undefined' ? navigator : {},
    );
    if (this.disposed) throw new Error('Audio engine disposed');
    if (typeof window !== 'undefined' && !this.toneGain) {
      this.toneGain = new Tone.Gain(0.5).toDestination();
      this.toneReverb = new Tone.Reverb({ decay: 1.85, wet: 0.45 }).connect(this.toneGain);
      this.addSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine1' },
        envelope: { attack: 0.05, decay: 0.28, sustain: 0.18, release: 1.6 },
      }).connect(this.toneReverb);
      this.removeSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine7' },
        envelope: { attack: 0.004, decay: 0.12, sustain: 0.08, release: 0.42 },
      }).connect(this.toneReverb);
      this.addSynth.maxPolyphony = 30;
      this.removeSynth.maxPolyphony = 30;
    }
    if (!this.loading) {
      const paths = ['swells/swell1', 'swells/swell2', 'swells/swell3'];
      this.loading = Promise.all(paths.map(async path => {
        const response = await fetch(`/sounds/${path}.mp3`, { signal: this.abort.signal });
        if (!response.ok) throw new Error(`Impossibile caricare ${path}`);
        const buffer = await this.context!.decodeAudioData(await response.arrayBuffer());
        if (!this.disposed) this.buffers.set(path, buffer);
      })).then(() => {}).catch(error => { this.loading = null; throw error; });
    }
    await this.loading;
    if (!this.isRunning()) throw new Error('Audio playback is suspended');
  }
  setVolume(volume: number, muted: boolean): void {
    if (this.gain && this.context) this.gain.gain.setTargetAtTime(muted ? 0 : volume / 100, this.context.currentTime, 0.02);
    this.toneGain?.gain.rampTo(muted ? 0 : volume / 100, 0.02);
  }
  play(event: WikiEvent, scale: ScaleId = DEFAULT_SCALE): void {
    if (!this.context || this.context.state !== 'running' || !this.gain) return;
    if (this.songLoading) return;
    // A selected MP3 may accompany an edit, but it never replaces its scale note.
    if (this.song && event.kind === 'edit') this.playSegment(event.delta);
    const now = this.context.currentTime;
    if (!this.limiter.allow(now) || this.active.size >= 30) return;
    if (event.kind === 'welcome') {
      const buffer = this.buffers.get(`swells/swell${1 + Math.floor(Math.random() * 3)}`);
      if (!buffer) return;
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      gain.gain.value = event.bot ? 0.35 : 1;
      source.buffer = buffer;
      source.connect(gain).connect(this.gain);
      this.track(source, gain);
      source.start();
      return;
    }
    const midi = event.newPage ? 60 : getNote(event.delta, scale);
    const velocity = event.bot ? 0.28 : event.newPage ? 0.85 : 0.68;
    const synth = event.delta >= 0 ? this.addSynth : this.removeSynth;
    synth?.triggerAttackRelease(Tone.Frequency(midi, 'midi').toFrequency(), '8n', Tone.now(), velocity);
  }
  private track(source: AudioScheduledSourceNode, gain: GainNode): void {
    this.active.add(source);
    source.onended = () => { this.active.delete(source); source.disconnect(); gain.disconnect(); };
  }
  dispose(): void {
    this.stopSegment();
    this.songRequest++;
    this.disposed = true;
    this.context?.removeEventListener('statechange', this.checkPlayback);
    this.toneContext?.off('statechange', this.checkPlayback);
    this.abort.abort();
    for (const source of this.active) source.stop();
    this.active.clear();
    this.buffers.clear();
    this.songCache.clear();
    this.songCursors.clear();
    this.addSynth?.dispose();
    this.removeSynth?.dispose();
    this.toneReverb?.dispose();
    this.toneGain?.dispose();
    this.gain?.disconnect();
    void this.context?.close();
  }
}
