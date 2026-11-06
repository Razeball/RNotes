export function describeOpenError(error: unknown, t: (key: string) => string): string {
  switch (String(error)) {
    case 'rnotes:not-a-document':
      return t("This file isn't a document RNotes can open.")
    case 'rnotes:damaged-rdocx':
      return t('This RNotes document is damaged and cannot be read.')
    case 'rnotes:invalid-json':
      return t("This JSON file isn't an RNotes document.")
    default:
      return String(error)
  }
}

/** What `save_tab`, `save_tab_as`, `export_to_file` and `export_to_pdf` answer. */
export type SaveOutcome = { status: 'saved'; path: string } | { status: 'cancelled' } | { status: 'pdf' }

type Translate = (key: string, options?: Record<string, string>) => string

/**
 * Turns a failed save into a sentence. Rust sends two shapes the user can actually cause:
 * `rnotes:write-failed:<reason>` — the reason is the operating system's own, already in the user's
 * language on Windows — and `rnotes:invalid-document:<position>|<detail>`, where the position is
 * 1-based block › child › … indices.
 */
export function describeSaveError(error: unknown, t: Translate): string {
  const text = String(error)
  if (text.startsWith('rnotes:write-failed:')) {
    return t('Could not write the file: {{reason}}', { reason: text.slice('rnotes:write-failed:'.length) })
  }
  if (text.startsWith('rnotes:invalid-document:')) {
    const [position, detail] = text.slice('rnotes:invalid-document:'.length).split('|')
    return t('The document has an element RNotes cannot save (position {{position}}): {{detail}}', {
      position: position || '?',
      detail: detail ?? '',
    })
  }
  return text
}
