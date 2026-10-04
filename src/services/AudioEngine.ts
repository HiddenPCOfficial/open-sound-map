import { editDuration } from '../lib/mp3';
import { resumePlayback, unlockAudioContext } from '../lib/audio';
import { DEFAULT_SCALE, getEditSound, type ScaleId } from '../lib/music';
import type { WikiEvent } from '../types/wiki';
import * as Tone from 'tone';

/** Owns audio resources outside React; Tone.js synthesizes map edits alongside MP3 music. */
export class AudioEngine {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private addSynth: Tone.PolySynth<Tone.Synth> | null = null;
  private removeSynth: Tone.PolySynth<Tone.Synth> | null = null;
  private toneReverb: Tone.Reverb | null = null;
  private active = new Set<AudioScheduledSourceNode>();
  private abort = new AbortController();
  private disposed = false;
  private queue: { event: WikiEvent; scale: ScaleId; url?: string | null; resolve: () => void; reject: (error: unknown) => void }[] = [];
  private queueTimer: ReturnType<typeof setTimeout> | null = null;
  private pumping = false;
  private playbackGeneration = 0;
  private previousEdit?: WikiEvent;
  private previousMidi?: number;
  private segments = new Map<AudioBufferSourceNode, { start: number; offset: number; duration: number; song: AudioBuffer; url: string | null; envelope: GainNode }>();
  private toneContext: Tone.Context | null = null;
  constructor(private onInterrupted: () => void = () => {}) {}
  private checkPlayback = (): void => {
    if (!this.disposed && !this.isRunning()) { this.stopSegment(); this.onInterrupted(); }
  };
  isRunning(): boolean {
    return this.context?.state === 'running' && (!this.toneContext || this.toneContext.state === 'running');
  }

  private songUrl: string | null = null;
  private songCache = new Map<string, AudioBuffer>();
  private songDownloads = new Map<string, Promise<AudioBuffer>>();
  private songCursors = new Map<string, number>();
  private song: AudioBuffer | null = null;
  private cursor = 0;
  private songRequest = 0;
  private minSeconds = 0.5;
  private maxSeconds = 5;

  setSegmentRange(min: number, max: number): void { this.minSeconds = min; this.maxSeconds = max; }
  eventDuration(event: WikiEvent, url?: string | null, scale: ScaleId = DEFAULT_SCALE): number {
    return (url === undefined ? this.songUrl : url) ? (event.osm ? this.minSeconds : editDuration(event.delta, this.minSeconds, this.maxSeconds)) : getEditSound(event, scale, this.previousEdit, this.previousMidi).interval;
  }
  stopSegment(): void {
    console.info('[AudioEngine] Arresto audio', { eventiAnnullati: this.queue.length, segmentiAttivi: this.segments.size });
    this.playbackGeneration++;
    this.songRequest++;
    if (this.queueTimer) clearTimeout(this.queueTimer);
    this.queueTimer = null;
    for (const item of this.queue.splice(0)) item.resolve();
    const now = this.context?.currentTime ?? 0;
    // Preserve the actual playback position, not the end of a scheduled segment.
    for (const [source, segment] of this.segments) {
      const elapsed = Math.max(0, Math.min(segment.duration, now - segment.start));
      const cursor = (segment.offset + elapsed) % segment.song.duration;
      if (segment.url) this.songCursors.set(segment.url, cursor);
      if (segment.url === this.songUrl) this.cursor = cursor;
      source.stop();
    }
    this.segments.clear();
    this.addSynth?.releaseAll();
    this.removeSynth?.releaseAll();
    this.previousEdit = undefined;
    this.previousMidi = undefined;
  }
  async selectSong(url: string | null): Promise<void> {
    this.stopSegment();
    await this.loadSong(url);
  }
  private async loadSong(url: string | null): Promise<void> {
    const request = ++this.songRequest;
    if (this.songUrl) this.songCursors.set(this.songUrl, this.cursor);
    this.songUrl = url;
    this.song = null;
    this.cursor = 0;
    if (!url) return;
    await this.enable();
    const buffer = await this.prepareSong(url);
    if (request !== this.songRequest || this.disposed) return;
    this.song = buffer;
    this.cursor = this.songCursors.get(url) ?? 0;
  }
  private prepareSong(url: string): Promise<AudioBuffer> {
    const cached = this.songCache.get(url);
    if (cached) return Promise.resolve(cached);
    const downloading = this.songDownloads.get(url);
    if (downloading) return downloading;
    const download = (async () => {
      const response = await fetch(url, { signal: this.abort.signal });
      if (!response.ok) throw new Error('Impossibile caricare il brano');
      const buffer = await this.context!.decodeAudioData(await response.arrayBuffer());
      if (!this.disposed) this.songCache.set(url, buffer);
      return buffer;
    })().finally(() => this.songDownloads.delete(url));
    this.songDownloads.set(url, download);
    return download;
  }
  playLocation(event: WikiEvent, url: string | null, scale: ScaleId): Promise<void> {
    return this.enqueue(event, scale, url);
  }
  private enqueue(event: WikiEvent, scale: ScaleId, url?: string | null): Promise<void> {
    if (event.kind !== 'edit' || this.disposed || !this.isRunning()) {
      console.info('[AudioEngine] Audio non riprodotto', {
        eventId: event.id,
        motivo: event.kind !== 'edit' ? 'evento non musicale' : this.disposed ? 'motore chiuso' : 'contesto audio non attivo: abilita o riattiva audio',
        statoAudio: this.context?.state ?? 'non inizializzato',
        statoTone: this.toneContext?.state ?? 'non inizializzato',
      });
      return Promise.resolve();
    }
    // Download upcoming country tracks while earlier changesets are playing.
    if (url) void this.prepareSong(url).catch(() => {});
    return new Promise((resolve, reject) => {
      this.queue.push({ event, scale, url, resolve, reject });
      void this.pump();
    });
  }
  private async pump(): Promise<void> {
    if (this.pumping || this.disposed || !this.isRunning()) return;
    if (this.queueTimer) clearTimeout(this.queueTimer);
    this.queueTimer = null;
    this.pumping = true;
    const generation = this.playbackGeneration;
    try {
      // EventSequence sets the spacing; sound duration must not delay later edits.
      while (this.queue.length && this.isRunning()) {
        const item = this.queue.shift()!;
        try {
          if (item.url !== undefined && this.songUrl !== item.url) {
            console.info('[AudioEngine] Caricamento brano prima della nota', { eventId: item.event.id, url: item.url });
            await this.loadSong(item.url);
          }
          if (generation !== this.playbackGeneration || this.disposed || !this.isRunning()) {
            console.info('[AudioEngine] Riproduzione annullata dopo il caricamento', { eventId: item.event.id, statoAudio: this.context?.state });
            item.resolve(); break;
          }
          const now = this.context!.currentTime + 0.1;
          const duration = this.eventDuration(item.event, undefined, item.scale);
          if (this.song) this.playSegment(now, duration);
          this.playNote(item.event, item.scale, now);
          console.info('[AudioEngine] Audio programmato', {
            eventId: item.event.id,
            attesaSecondi: 0.1,
            inizioContestoSecondi: now,
            durataSecondi: duration,
            brano: this.songUrl ?? 'sintetizzatore',
            statoAudio: this.context!.state,
            eventiInCoda: this.queue.length,
          });
          item.resolve();
        } catch (error) {
          console.error('[AudioEngine] Errore di riproduzione', { eventId: item.event.id, error });
          item.reject(error);
        }
      }
    } finally {
      this.pumping = false;
      if (this.queue.length && !this.disposed && this.isRunning()) this.queueTimer = setTimeout(() => { void this.pump(); }, 25);
    }
  }
  private playSegment(now: number, duration: number): void {
    if (!this.context || !this.gain || !this.song) return;
    // Adjacent or overlapping events using the same song share one source.
    for (const [source, segment] of this.segments) {
      const end = segment.start + segment.duration;
      if (segment.song !== this.song || now < segment.start || now > end + 0.001) continue;
      const extension = Math.max(0, now + duration - end);
      if (extension === 0) return;
      const fadeStart = Math.max(segment.start, now - 0.005);
      segment.envelope.gain.cancelScheduledValues(fadeStart);
      segment.envelope.gain.setValueAtTime(1, fadeStart);
      segment.duration += extension;
      segment.envelope.gain.setValueAtTime(1, end + extension - 0.005);
      segment.envelope.gain.linearRampToValueAtTime(0, end + extension);
      source.stop(end + extension);
      this.cursor = (this.cursor + extension) % this.song.duration;
      if (this.songUrl) this.songCursors.set(this.songUrl, this.cursor);
      return;
    }
    const source = this.context.createBufferSource();
    const envelope = this.context.createGain();
    const song = this.song;
    const offset = this.cursor;
    const url = this.songUrl;
    source.buffer = song;
    source.loop = true;
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(1, now + Math.min(0.005, duration / 4));
    envelope.gain.setValueAtTime(1, now + duration - Math.min(0.005, duration / 4));
    envelope.gain.linearRampToValueAtTime(0, now + duration);
    source.connect(envelope).connect(this.gain);
    this.segments.set(source, { start: now, offset, duration, song, url, envelope });
    this.cursor = (offset + duration) % song.duration;
    if (url) this.songCursors.set(url, this.cursor);
    source.onended = () => {
      this.segments.delete(source);
      source.disconnect(); envelope.disconnect();
    };
    source.start(now, offset);
    source.stop(now + duration);
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
      // Tone voices and native MP3 sources must use the same hardware context.
      this.toneContext = new Tone.Context({ context: this.context });
      Tone.setContext(this.toneContext);
    }
    const resuming = resumePlayback(
      [this.context],
      typeof navigator !== 'undefined' ? navigator : {},
    );
    unlockAudioContext(this.context);
    await resuming;
    if (this.disposed) throw new Error('Audio engine disposed');
    if (this.toneContext && !this.addSynth) {
      this.toneReverb = new Tone.Reverb({ context: this.toneContext, decay: 1.85, wet: 0.50 }).connect(this.gain!);
      this.addSynth = new Tone.PolySynth({
        context: this.toneContext,
        voice: Tone.Synth,
        options: {
          oscillator: { type: 'sine1' },
          envelope: { attack: 0.05, decay: 0.28, sustain: 0.18, release: 1.6 },
        },
      }).connect(this.toneReverb);
      this.removeSynth = new Tone.PolySynth({
        context: this.toneContext,
        voice: Tone.Synth,
        options: {
          oscillator: { type: 'sawtooth' },
          envelope: { attack: 0.001, decay: 0.12, sustain: 0.08, release: 0.42 },
        },
      }).connect(this.toneReverb);
      this.addSynth.maxPolyphony = 30;
      this.removeSynth.maxPolyphony = 30;
    }
    if (!this.isRunning()) throw new Error('Audio playback is suspended');
  }
  setVolume(volume: number, muted: boolean): void {
    if (this.gain && this.context) this.gain.gain.setTargetAtTime(muted ? 0 : volume / 100, this.context.currentTime, 0.02);
  }
  playTestTone(): void {
    if (!this.context || !this.gain || !this.isRunning()) return;
    const now = this.context.currentTime;
    const source = this.context.createOscillator();
    const envelope = this.context.createGain();
    source.frequency.value = 440;
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(0.3, now + 0.02);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    source.connect(envelope).connect(this.gain);
    this.track(source, envelope);
    source.start(now);
    source.stop(now + 0.4);
  }
  play(event: WikiEvent, scale: ScaleId = DEFAULT_SCALE): void {
    void this.enqueue(event, scale).catch(() => this.onInterrupted());
  }
  private playNote(event: WikiEvent, scale: ScaleId, at: number): void {
    const sound = getEditSound(event, scale, this.previousEdit, this.previousMidi);
    const synth = sound.removal ? this.removeSynth : this.addSynth;
    synth?.triggerAttackRelease(440 * 2 ** ((sound.midi - 69) / 12), sound.duration, at, sound.velocity);
    this.previousEdit = event;
    this.previousMidi = sound.midi;
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
    this.abort.abort();
    for (const source of this.active) source.stop();
    this.active.clear();
    this.songCache.clear();
    this.songDownloads.clear();
    this.songCursors.clear();
    this.addSynth?.dispose();
    this.removeSynth?.dispose();
    this.toneReverb?.dispose();
    this.gain?.disconnect();
    if (this.toneContext) this.toneContext.dispose();
    else void this.context?.close();
  }
}
