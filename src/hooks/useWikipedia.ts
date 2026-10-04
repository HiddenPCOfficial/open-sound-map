'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LOCATION_MODE, countriesFromTopology, trackForLocation, type Country } from '@/lib/locationMusic';
import { BUILTIN_TRACKS, type MusicTrack } from '@/lib/mp3';
import { AudioEngine } from '@/services/AudioEngine';
import { OpenStreetMapStream } from '@/services/OpenStreetMapStream';
import { matchesTags } from '@/lib/events';
import type { ConnectionStatus, Settings, WikiEvent } from '@/types/wiki';

export function useWikipedia(settings: Settings, ready: boolean) {
  const [tracks, setTracks] = useState<MusicTrack[]>(BUILTIN_TRACKS);
  const [selectedTrack, setSelectedTrack] = useState('');
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState('');
  const [segmentRange, setSegmentRange] = useState({ min: 0.5, max: 5 });
  const uploadUrls = useRef<string[]>([]);
  const selection = useRef(0);
  const locationMode = useRef(false);
  const countries = useRef<Country[]>([]);
  const [locationTrack, setLocationTrack] = useState('');
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [events, setEvents] = useState<WikiEvent[]>([]);
  const [recent, setRecent] = useState<WikiEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [rate, setRate] = useState(0);
  const [audioState, setAudioState] = useState<'off' | 'loading' | 'on' | 'error'>('off');
  const settingsRef = useRef(settings);
  const audio = useRef<AudioEngine | null>(null);
  const times = useRef<number[]>([]);
  const seen = useRef(new Set<string>());
  useEffect(() => { settingsRef.current = settings; audio.current?.setVolume(settings.volume, settings.muted); if (settings.muted || settings.volume === 0) audio.current?.stopSegment(); }, [settings]);
  useEffect(() => {
    const engine = new AudioEngine(() => {
      setAudioState(current => current === 'on' ? 'off' : current);
    });
    const checkPlayback = () => {
      if (!engine.isRunning()) setAudioState(current => current === 'on' ? 'off' : current);
    };
    document.addEventListener('visibilitychange', checkPlayback);
    window.addEventListener('pageshow', checkPlayback);
    const urls = uploadUrls.current;
    audio.current = engine;
    return () => {
      document.removeEventListener('visibilitychange', checkPlayback);
      window.removeEventListener('pageshow', checkPlayback);
      audio.current = null; engine.dispose(); urls.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);
  const enabled = ready;
  useEffect(() => {
    if (!enabled) return;
    const stream = new OpenStreetMapStream();
    stream.connect(event => {
      const current = settingsRef.current;
      if (seen.current.has(event.id)) return;
      seen.current.add(event.id);
      if (seen.current.size > 4000) seen.current.delete(seen.current.values().next().value!);
      if (event.kind === 'welcome' && (current.hideWelcomes || current.tags.length > 0)) return;
      const audible = matchesTags(event, current.tags);
      if (event.kind === 'edit' && audible) {
        times.current.push(event.receivedAt);
        setTotal(value => value + 1);
      }
      if (audible) {
        if (!current.muted && current.volume > 0) {
          if (locationMode.current) {
            const track = trackForLocation(event.location, countries.current);
            setLocationTrack(track?.name ?? 'Note musicali · nessun brano per questo paese');
            void audio.current?.playLocation(event, track?.url ?? null, current.scale).catch(() => setTrackError('Impossibile caricare il brano del paese.'));
          } else audio.current?.play(event, current.scale);
        }
        setRecent(list => [event, ...list].slice(0, 20));
      }
      if (!current.hideGraphics) {
        // Unmatched edits remain visible as faint, silent circles as in the original.
        setEvents(list => [...list.filter(item => event.receivedAt - item.receivedAt < (item.kind === 'welcome' ? 7000 : 60000)), event].slice(-180));
      }
    }, setStatus);
    return () => stream.close();
  }, [enabled]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      times.current = times.current.filter(time => now - time < 60000);
      let weighted = 0;
      for (let i = 0; i < 6; i++) {
        weighted += times.current.filter(time => now - time >= i * 10000 && now - time < (i + 1) * 10000).length * (6 - i) * 6;
      }
      setRate(Math.round(weighted / 21));
      setEvents(list => list.filter(event => now - event.receivedAt < (event.kind === 'welcome' ? 7000 : 60000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const enableAudio = useCallback(async () => {
    const engine = audio.current;
    if (!engine) return;
    setAudioState('loading');
    try {
      await engine.enable();
      if (audio.current !== engine) return;
      engine.setVolume(settingsRef.current.volume, settingsRef.current.muted);
      setAudioState('on');
    } catch {
      if (audio.current === engine) setAudioState('error');
    }
  }, []);
  const selectTrack = async (id: string, available = tracks) => {
    const request = ++selection.current;
    locationMode.current = false;
    setLocationTrack('');
    const track = available.find(item => item.id === id);
    setSelectedTrack(id); setTrackError(''); setTrackLoading(Boolean(track) || id === LOCATION_MODE);
    try {
      // Unlock both contexts during the selection gesture, before fetching borders.
      if (id === LOCATION_MODE) await audio.current?.enable();
      await audio.current?.selectSong(track?.url ?? null);
      if (id === LOCATION_MODE && countries.current.length === 0) {
        const response = await fetch('/geo/countries-110m.json');
        if (!response.ok) throw new Error('Confini non disponibili');
        countries.current = countriesFromTopology(await response.json());
      }
      if (selection.current !== request) return;
      if (id === LOCATION_MODE) { await audio.current?.enable(); if (selection.current !== request) return; locationMode.current = true; }

      if (selection.current !== request) return;
      if (track || id === LOCATION_MODE) { audio.current?.setVolume(settingsRef.current.volume, settingsRef.current.muted); setAudioState('on'); }
    } catch {
      if (selection.current !== request) return;
      locationMode.current = false; setSelectedTrack(''); setTrackError('MP3 non leggibile. Seleziona un altro file e riprova.');
    } finally { if (selection.current === request) setTrackLoading(false); }
  };
  const uploadTracks = (files: FileList) => {
    const valid = Array.from(files).filter(file => /\.mp3$/i.test(file.name) && file.size > 0 && file.size <= 100 * 1024 * 1024);
    if (valid.length !== files.length) setTrackError('Sono ammessi file MP3 non vuoti fino a 100 MB.');
    const added = valid.map(file => { const url = URL.createObjectURL(file); uploadUrls.current.push(url); return { id: crypto.randomUUID(), name: file.name.replace(/\.mp3$/i, ''), url }; });
    const next = [...tracks, ...added]; setTracks(next);
    if (added.length) void selectTrack(added[0].id, next);
  };
  const changeSegmentRange = (min: number, max: number) => {
    setSegmentRange({ min, max }); audio.current?.setSegmentRange(min, max);
  };
  return { locationTrack, tracks, selectedTrack, trackLoading, trackError, segmentRange, selectTrack, uploadTracks, changeSegmentRange, status: enabled ? status : 'paused' as const, events, recent, total, rate, audioState, enableAudio };
}
