import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import es from './locales/es.json'

/** Translation setup where keys are English text so missing translations fall back to readable English instead of keys. This disables keySeparator and nsSeparator because keys like "Error:" would otherwise be misinterpreted as namespaces or nested paths. */

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
] as const

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code']

const FALLBACK: LanguageCode = 'en'

/** Returns the best supported match for the operating system locale like es-AR to es, or falls back to English if no match is found. */
export function guessBestSupportedLocaleCode(): LanguageCode {
  const candidates = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []

  for (const candidate of candidates) {
    const base = candidate?.split('-')[0]?.toLowerCase()
    const match = SUPPORTED_LANGUAGES.find((language) => language.code === base)
    if (match) return match.code
  }

  return FALLBACK
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
  },
  lng: guessBestSupportedLocaleCode(),
  fallbackLng: FALLBACK,
  interpolation: {
    // React escapes for us; doing it again would turn an apostrophe into `&#39;` on screen.
    escapeValue: false,
  },
  keySeparator: false,
  nsSeparator: false,
})

/** Activates the user's saved language preference or follows the system if none is stored by calling i18n.changeLanguage when needed. */
export function activatePreferredUserLanguage(stored: string | undefined | null): void {
  const target = stored && SUPPORTED_LANGUAGES.some((l) => l.code === stored) ? stored : guessBestSupportedLocaleCode()
  if (i18n.language !== target) void i18n.changeLanguage(target)
}

export default i18n