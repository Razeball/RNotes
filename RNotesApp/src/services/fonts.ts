import { useSyncExternalStore } from 'react'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'

/**
 * The fonts RNotes offers before anyone opens the font window: the five bundled in `public/fonts`
 * (registered by `@font-face` in App.css) and the ten that every desktop has. Until the user
 * accepts the window once, the toolbar shows exactly these — the list it always had.
 */
export const BUNDLED_FONTS = ['Arimo', 'Google Sans Code', 'Jacquard 12', 'Roboto Flex', 'Tinos']
/** The bundled families that ship an italic face in `App.css`; the other two are upright only. */
export const BUNDLED_ITALIC = new Set(['Arimo', 'Google Sans Code', 'Tinos'])
export const DEFAULT_FONTS = [
  'Arial',
  'Times New Roman',
  'Courier New',
  'Georgia',
  'Verdana',
  'Helvetica',
  'Trebuchet MS',
  'Comic Sans MS',
  'Impact',
  'Lucida Console',
  ...BUNDLED_FONTS,
]

/**
 * A family name as a CSS `font-family` value. It has to be quoted: unquoted, a name is read as a
 * sequence of identifiers, and an identifier cannot start with a digit — `Jacquard 12` is an invalid
 * declaration, so the browser dropped it and the bundled font never rendered. The same goes for any
 * imported name with a digit or punctuation in it.
 */
export function cssFontFamily(name: string): string {
  return `"${name.replace(/["\\]/g, '\\$&')}"`
}

export interface ImportedFace {
  path: string
  weightMin: number
  weightMax: number
  italic: boolean
}

export interface ImportedFamily {
  name: string
  faces: ImportedFace[]
}

interface LibraryView {
  enabled: string[] | null
  families: ImportedFamily[]
}

export interface ImportReport {
  added: string[]
  skipped: string[]
}

export interface FontLibraryState {
  /** What the toolbar's dropdown lists, in its order. */
  enabled: string[]
  /** What the user imported; each face is registered with the document when the library loads. */
  imported: ImportedFamily[]
}

let state: FontLibraryState = { enabled: DEFAULT_FONTS, imported: [] }
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const setState = (next: FontLibraryState) => {
  state = next
  listeners.forEach((listener) => listener())
}

/** The library as React state, shared by the toolbar and the font window. */
export function useFontLibrary(): FontLibraryState {
  return useSyncExternalStore(subscribe, () => state)
}

/**
 * An imported face is not installed anywhere the webview looks, so it is added to `document.fonts`
 * by hand. Registering through the FontFace API rather than a stylesheet keeps the faces removable:
 * deleting a family takes its faces out of the document again. Print and PDF export render in this
 * same document, so they see them too.
 */
const registered = new Map<string, FontFace>()

function registerFaces(families: ImportedFamily[]) {
  const wanted = new Set<string>()
  for (const family of families) {
    for (const face of family.faces) {
      wanted.add(face.path)
      if (registered.has(face.path)) continue
      const weight = face.weightMin === face.weightMax ? `${face.weightMin}` : `${face.weightMin} ${face.weightMax}`
      const fontFace = new FontFace(family.name, `url("${convertFileSrc(face.path)}")`, {
        weight,
        style: face.italic ? 'italic' : 'normal',
      })
      registered.set(face.path, fontFace)
      document.fonts.add(fontFace)
      fontFace.load().catch((error) => console.error(`Could not load the font ${family.name}:`, error))
    }
  }
  for (const [path, fontFace] of registered) {
    if (wanted.has(path)) continue
    document.fonts.delete(fontFace)
    registered.delete(path)
  }
}

export async function loadFontLibrary(): Promise<void> {
  try {
    const view = await invoke<LibraryView>('font_library')
    registerFaces(view.families)
    setState({ enabled: view.enabled ?? DEFAULT_FONTS, imported: view.families })
  } catch (error) {
    console.error('Could not load the font library:', error)
  }
}

export async function saveEnabledFonts(enabled: string[]): Promise<void> {
  await invoke('set_enabled_fonts', { enabled })
  setState({ ...state, enabled })
}

/** `null` when the picker was cancelled. */
export async function importFonts(fromFolder: boolean, title: string, filterLabel: string): Promise<ImportReport | null> {
  const report = await invoke<ImportReport | null>('import_fonts', { fromFolder, title, filterLabel })
  if (report) await loadFontLibrary()
  return report
}

export async function deleteFontFamily(name: string): Promise<void> {
  await invoke('delete_font_family', { name })
  await loadFontLibrary()
}

export interface SystemFamily {
  name: string
  /** Whether any of its faces is italic or oblique. */
  italic: boolean
}

export function systemFonts(): Promise<SystemFamily[]> {
  return invoke<SystemFamily[]>('system_fonts').catch(() => [])
}
