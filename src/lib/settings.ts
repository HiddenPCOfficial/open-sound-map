import { DEFAULT_SCALE, isScaleId } from './music';
import { LANGUAGES } from './languages';
import type { Settings } from '../types/wiki';

export const DEFAULT_SETTINGS: Settings = {
  scale: DEFAULT_SCALE, languages: ['en'], tags: [], volume: 50, muted: false,
  hideTitles: false, hideWelcomes: false, hideGraphics: false, hideLog: false,
};
export function parseTags(value: string): string[] {
  return [...new Set(value.split(/[\s,]+/u).map(tag => tag.replace(/^#+/, '').toLowerCase()).filter(Boolean))];
}
export function parseHash(hash: string): Partial<Settings> {
  const values = hash.replace(/^#/, '').split(',');
  const languages = values.filter(code => Object.hasOwn(LANGUAGES, code));
  const storedScale = values.find(value => value.startsWith('scale='))?.slice(6) ?? '';
  // Migrate links/preferences created with the previous modal identifiers.
  const scale = storedScale === 'major' ? 'ionian' : storedScale === 'minor' ? 'aeolian' : storedScale;
  return { scale: isScaleId(scale) ? scale : DEFAULT_SCALE, languages: values.includes('none') ? [] : languages.length ? languages : ['en'], hideTitles: values.includes('notitles'), hideWelcomes: values.includes('nowelcomes') };
}
export function settingsHash(settings: Settings): string {
  return '#' + [...(settings.languages.length ? settings.languages : ['none']), `scale=${settings.scale}`, ...(settings.hideTitles ? ['notitles'] : []), ...(settings.hideWelcomes ? ['nowelcomes'] : [])].join(',');
}
