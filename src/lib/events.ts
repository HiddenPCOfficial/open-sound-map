import { LANGUAGES } from './languages';
import type { WikiEvent } from '../types/wiki';

/** Validate untrusted Wikimedia payloads before passing them to React or audio. */
export function normalizeEvent(payload: unknown, now = Date.now()): WikiEvent | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as Record<string, unknown>;
  if (typeof data.server_name !== 'string') return null;
  const language = data.server_name === 'www.wikidata.org' ? 'wikidata' : data.server_name.match(/^([a-z-]+)\.wikipedia\.org$/)?.[1];
  if (!language || !Object.hasOwn(LANGUAGES, language)) return null;
  const welcome = data.type === 'log' && data.log_type === 'newusers' && data.log_action === 'create';
  if (!welcome && !((data.type === 'edit' || data.type === 'new') && data.namespace === 0)) return null;
  if (typeof data.user !== 'string' || typeof data.title !== 'string') return null;
  const length = data.length as { old?: unknown; new?: unknown } | undefined;
  if (!welcome && (!length || typeof length.new !== 'number' || (data.type === 'edit' && typeof length.old !== 'number'))) return null;
  const delta = welcome ? 0 : (length!.new as number) - (typeof length!.old === 'number' ? length!.old : 0);
  if (!Number.isFinite(delta)) return null;
  const revision = data.revision as { old?: unknown; new?: unknown } | undefined;
  const revisionId = typeof revision?.new === 'number' && Number.isSafeInteger(revision.new) && revision.new > 0 ? revision.new : undefined;
  const previousRevisionId = typeof revision?.old === 'number' && Number.isSafeInteger(revision.old) && revision.old > 0 ? revision.old : undefined;
  const origin = `https://${data.server_name}`;
  const comment = typeof data.comment === 'string' ? data.comment : '';
  const userUrl = `${origin}/wiki/${encodeURIComponent(`${welcome ? 'User_talk' : 'User'}:${data.user}`)}`;
  return {
    id: `${language}:${String(data.id ?? data.timestamp ?? now)}:${welcome ? 'welcome' : 'edit'}`,
    kind: welcome ? 'welcome' : 'edit', language, title: data.title, user: data.user,
    url: welcome ? userUrl : `${origin}/wiki/${encodeURIComponent(data.title.replaceAll(' ', '_'))}`,
    revisionId, previousRevisionId,
    userUrl, delta, newPage: data.type === 'new', anonymous: data.anon === true, bot: data.bot === true,
    reverted: /revert|undo|undid/i.test(comment),
    hashtags: [...comment.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map(match => match[1].toLowerCase()),
    receivedAt: now,
  };
}
export function matchesTags(event: WikiEvent, tags: string[]): boolean {
  return tags.length === 0 || tags.some(tag => event.hashtags.includes(tag));
}
export function editRadius(delta: number): number {
  return Math.min(150, Math.max(3, Math.sqrt(Math.abs(delta)) * 5));
}
/** Stable position: repeated edits to the same article land in the same place. */
export function articlePosition(title: string): [number, number] {
  let hash = 2166136261;
  for (const char of title) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const x = (hash >>> 0) / 4294967296;
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  return [0.08 + x * 0.84, 0.12 + ((hash >>> 0) / 4294967296) * 0.76];
}
