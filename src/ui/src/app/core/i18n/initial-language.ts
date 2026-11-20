import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  LanguageCode,
  SUPPORTED_LANGUAGES,
} from '../constants/languages';

function isSupported(code: string | null | undefined): code is LanguageCode {
  return SUPPORTED_LANGUAGES.some((language) => language.code === code);
}

/** Starting language: saved choice, then browser language, then English. */
export function detectInitialLanguage(): LanguageCode {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isSupported(saved)) return saved;
  } catch {
    // Storage unavailable: fall through.
  }
  const browser = typeof navigator === 'undefined' ? undefined : navigator.language?.slice(0, 2);
  return isSupported(browser) ? browser : DEFAULT_LANGUAGE;
}
