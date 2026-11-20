import { resolve } from 'node:path';

export const screens = resolve(import.meta.dirname, '../src/assets/screens');

// The documentation languages; the UI follows the saved language (see openRelief).
export const languages = ['fr', 'en'] as const;

export const shot = (lang: string, name: string) => resolve(screens, lang, `${name}.png`);
