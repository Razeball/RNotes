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
