import { invoke } from '@tauri-apps/api/core'

interface UpdaterManifest {
  version: string
  notes?: string
}

const MANIFEST_URL = 'https://github.com/Razeball/RNotes/releases/latest/download/latest.json'


const isSameVersion = (a: string, b: string) =>
  a.trim().replace(/^v/i, '') === b.trim().replace(/^v/i, '')


export async function fetchReleaseNotes(version: string): Promise<string | null> {
  try {
    const response = await fetch(MANIFEST_URL, { cache: 'no-store' })
    if (!response.ok) return null

    const content = (await response.json()) as UpdaterManifest
    if (!isSameVersion(content.version ?? '', version)) return null

    const notes = (content.notes ?? '').trim()
    return notes || null
  } catch {
    return null
  }
}

export function storedReleaseNotes(version: string): Promise<string | null> {
  return invoke<string | null>('changelog_for', { version }).catch(() => null)
}

export function storeReleaseNotes(version: string, body: string, seen: boolean): Promise<void> {
  return invoke<void>('store_changelog', { version, body, seen }).catch(() => {})
}

export async function releaseNotesFor(version: string): Promise<string | null> {
  const stored = await storedReleaseNotes(version)
  if (stored) return stored

  const fetched = await fetchReleaseNotes(version)
  if (fetched) await storeReleaseNotes(version, fetched, true)
  return fetched
}
