import type { ScaleId } from '../lib/music';
export interface WikiEvent {
  osm?: { type: 'node' | 'way' | 'relation'; id: number; version: number; changesetId: number; action: 'create' | 'modify' | 'delete' };
  changesetUrl?: string;
  location?: { lat: number; lon: number };
  id: string;
  kind: 'edit' | 'welcome';
  language: string;
  title: string;
  user: string;
  url: string;
  userUrl: string;
  delta: number;
  newPage?: boolean;
  revisionId?: number;
  previousRevisionId?: number;
  anonymous: boolean;
  bot: boolean;
  reverted: boolean;
  hashtags: string[];
  receivedAt: number;
  /** Original edit time in milliseconds since the Unix epoch. */
  editedAt?: number;
  /** Arrival time preserved when the presentation queue updates receivedAt. */
  observedAt?: number;
}

export interface Settings {
  languages: string[];
  tags: string[];
  volume: number;
  scale: ScaleId;
  intervalScale: number;
  muted: boolean;
  hideTitles: boolean;
  hideWelcomes: boolean;
  hideGraphics: boolean;
  hideLog: boolean;
}
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'paused';
