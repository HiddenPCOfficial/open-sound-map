import type { ScaleId } from '../lib/music';
export interface WikiEvent {
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
}

export interface Settings {
  languages: string[];
  tags: string[];
  volume: number;
  scale: ScaleId;
  muted: boolean;
  hideTitles: boolean;
  hideWelcomes: boolean;
  hideGraphics: boolean;
  hideLog: boolean;
}
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'paused';
