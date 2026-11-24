import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import CheckButton from './CheckButton'
import { useAlert } from './Notice'
import {
  BUNDLED_ITALIC,
  DEFAULT_FONTS,
  type SystemFamily,
  cssFontFamily,
  deleteFontFamily,
  importFonts,
  saveEnabledFonts,
  systemFonts,
  useFontLibrary,
} from '../services/fonts'
import '../styles/FontManager.css'

type FontSource = 'included' | 'system' | 'imported'

interface FontEntry {
  name: string
  source: FontSource
}

/** Not copy: the classic placeholder reads the same in every language, so it is never translated. */
const SAMPLE_TEXT = 'Lorem ipsum dolor sit amet'

/**
 * The font window. The left column searches and imports (top) and lists every installed font with a
 * checkmark (bottom); the right one is a single column with the fonts the toolbar offers in their
 * order, a preview of the font last pointed at, and accept or cancel.
 *
 * Ticking and reordering only edit a draft, which Accept saves and Cancel drops. Importing and
 * deleting act on the disk at once — a file is copied or removed when asked — but an imported family
 * only joins the toolbar through the draft, so cancelling leaves it installed and unticked.
 */
export default function FontManager({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const notify = useAlert()
  const library = useFontLibrary()
  const [draft, setDraft] = useState<string[]>([])
  const [system, setSystem] = useState<SystemFamily[] | null>(null)
  const [previewName, setPreviewName] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const addMenuRef = useRef<HTMLDivElement>(null)

  // Each opening starts from what the toolbar shows now; the system is rescanned so a font
  // installed while RNotes was running appears.
  useEffect(() => {
    if (!isOpen) return
    setDraft(library.enabled)
    setPreviewName(null)
    setSearch('')
    setAddMenuOpen(false)
    setSystem(null)
    let current = true
    void systemFonts().then((names) => {
      if (current) setSystem(names)
    })
    return () => {
      current = false
    }
  }, [isOpen])

  useEffect(() => {
    if (!addMenuOpen) return
    const close = (event: MouseEvent) => {
      if (!addMenuRef.current?.contains(event.target as Node)) setAddMenuOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [addMenuOpen])

  /** One entry per family, case-insensitively. An imported font wins over a system font of the same name. */
  const entries = useMemo(() => {
    const byName = new Map<string, FontEntry>()
    const add = (name: string, source: FontSource) => {
      const key = name.toLowerCase()
      if (!byName.has(key)) byName.set(key, { name, source })
    }
    library.imported.forEach((family) => add(family.name, 'imported'))
    DEFAULT_FONTS.forEach((name) => add(name, 'included'))
    ;(system ?? []).forEach((family) => add(family.name, 'system'))
    // A ticked font that is no longer installed anywhere still has to be untickable.
    draft.forEach((name) => add(name, 'system'))
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }, [library.imported, system, draft])

  /**
   * Family names (lower-cased) that own a real italic face. Without one the webview slants the
   * upright face, which is not what the font looks like, so the preview leaves the italic line out.
   */
  const italicFamilies = useMemo(() => {
    const names = new Set<string>()
    library.imported.forEach((family) => {
      if (family.faces.some((face) => face.italic)) names.add(family.name.toLowerCase())
    })
    BUNDLED_ITALIC.forEach((name) => names.add(name.toLowerCase()))
    ;(system ?? []).forEach((family) => {
      if (family.italic) names.add(family.name.toLowerCase())
    })
    return names
  }, [library.imported, system])

  const preview = previewName ?? draft[0] ?? entries[0]?.name ?? null
  const previewHasItalic = preview !== null && italicFamilies.has(preview.toLowerCase())

  const query = search.trim().toLowerCase()
  const visible = query ? entries.filter((entry) => entry.name.toLowerCase().includes(query)) : entries
  const enabled = new Set(draft)

  const toggle = (name: string) =>
    setDraft((previous) => (previous.includes(name) ? previous.filter((font) => font !== name) : [...previous, name]))

  const move = (index: number, delta: number) =>
    setDraft((previous) => {
      const next = [...previous]
      const [font] = next.splice(index, 1)
      next.splice(index + delta, 0, font)
      return next
    })

  const sourceLabel = (source: FontSource) =>
    source === 'imported' ? t('Imported') : source === 'included' ? t('Included') : t('System')

  const handleImport = async (fromFolder: boolean) => {
    setAddMenuOpen(false)
    setBusy(true)
    try {
      const report = await importFonts(
        fromFolder,
        fromFolder ? t('Choose a folder with fonts') : t('Choose font files'),
        t('Font files'),
      )
      if (!report) return
      setDraft((previous) => [...previous, ...report.added.filter((name) => !previous.includes(name))])
      if (report.skipped.length) {
        notify(
          `${t("These files are not fonts RNotes can read:")}\n${report.skipped.join('\n')}`,
          t('Some files were skipped'),
        )
      } else if (!report.added.length) {
        notify(t('No new fonts were found. The ones there are already installed.'), t('Add fonts'))
      }
    } catch (error) {
      notify(String(error), t('Could not add the fonts'))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    const name = pendingDelete
    setPendingDelete(null)
    if (!name) return
    try {
      await deleteFontFamily(name)
      setDraft((previous) => previous.filter((font) => font !== name))
      setPreviewName((previous) => (previous === name ? null : previous))
    } catch (error) {
      notify(String(error), t('Could not delete the font'))
    }
  }

  const handleAccept = async () => {
    try {
      await saveEnabledFonts(draft)
      onClose()
    } catch (error) {
      notify(String(error), t('Could not save the font list'))
    }
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={t('Fonts')} className="rn-fonts-modal">
        <div className="rn-fonts">
          <section className="rn-fonts-cell rn-fonts-find">
            <input
              type="search"
              className="rn-fonts-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('Search installed fonts')}
              autoFocus
            />
            <div className="rn-fonts-add" ref={addMenuRef}>
              <button className="rn-fonts-add-button" disabled={busy} onClick={() => setAddMenuOpen((open) => !open)}>
                {busy ? t('Adding fonts…') : t('Add fonts')}
              </button>
              {addMenuOpen && (
                <div className="rn-fonts-add-menu" role="menu">
                  <button role="menuitem" onClick={() => void handleImport(true)}>
                    <span className="rn-fonts-add-title">{t('From a folder')}</span>
                    <span className="rn-fonts-add-hint">{t('Finds every font inside and groups its variants')}</span>
                  </button>
                  <button role="menuitem" onClick={() => void handleImport(false)}>
                    <span className="rn-fonts-add-title">{t('Font files')}</span>
                    <span className="rn-fonts-add-hint">{t('One or more .ttf or .otf files')}</span>
                  </button>
                </div>
              )}
            </div>
            <p className="rn-fonts-note">
              {t('Added fonts are copied into RNotes, so they keep working if the original files are moved.')}
            </p>
          </section>

          <section className="rn-fonts-cell rn-fonts-side">
            <div className="rn-fonts-in-use">
              <h4 className="rn-fonts-heading">
                {t('In use')}
                <span className="rn-fonts-count">{draft.length}</span>
              </h4>
              <p className="rn-fonts-note">{t('The fonts in use appear in the toolbar, in this order.')}</p>
              {draft.length === 0 ? (
                <div className="rn-fonts-empty">{t('Tick at least one font for the toolbar.')}</div>
              ) : (
                <ol className="rn-fonts-list">
                  {draft.map((name, index) => (
                    <li key={name} className="rn-fonts-used" onMouseEnter={() => setPreviewName(name)}>
                      <span className="rn-fonts-name" style={{ fontFamily: cssFontFamily(name) }}>{name}</span>
                      <span className="rn-fonts-used-actions">
                        <button disabled={index === 0} onClick={() => move(index, -1)} aria-label={t('Move up')} title={t('Move up')}>▲</button>
                        <button disabled={index === draft.length - 1} onClick={() => move(index, 1)} aria-label={t('Move down')} title={t('Move down')}>▼</button>
                        <button onClick={() => toggle(name)} aria-label={t('Remove from the toolbar')} title={t('Remove from the toolbar')}>✕</button>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {preview !== null && (
              <div className="rn-fonts-preview" aria-live="polite">
                <h4 className="rn-fonts-heading">
                  {t('Preview')}
                  <span className="rn-fonts-preview-name">{preview}</span>
                </h4>
                <div className="rn-fonts-sample">
                  <span className="rn-fonts-sample-label">{t('Regular')}</span>
                  <span className="rn-fonts-sample-text" style={{ fontFamily: cssFontFamily(preview) }}>{SAMPLE_TEXT}</span>
                </div>
                {/* The box stays either way, so pointing from font to font does not resize the list above. */}
                <div className="rn-fonts-sample">
                  <span className="rn-fonts-sample-label">{t('Italic')}</span>
                  {previewHasItalic ? (
                    <span className="rn-fonts-sample-text rn-fonts-sample-italic" style={{ fontFamily: cssFontFamily(preview) }}>{SAMPLE_TEXT}</span>
                  ) : (
                    <span className="rn-fonts-sample-text rn-fonts-no-italic">{t('This font has no italic version.')}</span>
                  )}
                </div>
              </div>
            )}

            <div className="rn-fonts-buttons">
              <button onClick={onClose}>{t('Cancel')}</button>
              <button className="rn-fonts-accept" disabled={draft.length === 0 || busy} onClick={() => void handleAccept()}>
                {t('Accept')}
              </button>
            </div>
          </section>

          <section className="rn-fonts-cell rn-fonts-installed">
            <h4 className="rn-fonts-heading">
              {t('Installed fonts')}
              <span className="rn-fonts-count">{entries.length}</span>
              {system === null && <span className="rn-fonts-loading">{t('Looking for system fonts…')}</span>}
            </h4>
            {visible.length === 0 ? (
              <div className="rn-fonts-empty">{t('No matching font found')}</div>
            ) : (
              <div className="rn-fonts-list">
                {visible.map((entry) => (
                  <div
                    key={entry.name}
                    className="rn-fonts-row"
                    data-checked={enabled.has(entry.name) ? 'true' : undefined}
                    onMouseEnter={() => setPreviewName(entry.name)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      toggle(entry.name)
                    }}
                  >
                    <CheckButton checked={enabled.has(entry.name)} onToggle={() => toggle(entry.name)} label={entry.name} />
                    <span className="rn-fonts-name" style={{ fontFamily: cssFontFamily(entry.name) }}>{entry.name}</span>
                    <span className="rn-fonts-tag">{sourceLabel(entry.source)}</span>
                    {entry.source === 'imported' && (
                      <button
                        className="rn-fonts-delete"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => setPendingDelete(entry.name)}
                        aria-label={t('Delete font')}
                        title={t('Delete font')}
                      >
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                          <path d="M6 2h4l.5 1H13v1.5H3V3h2.5L6 2zm-2 3.5h8l-.6 8.1a1 1 0 0 1-1 .9H5.6a1 1 0 0 1-1-.9L4 5.5zm2.2 1.5.3 6h1l-.2-6H6.2zm2.5 0-.2 6h1l.3-6H8.7z" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </Modal>

      <Modal isOpen={pendingDelete !== null} onClose={() => setPendingDelete(null)} title={t('Delete font')}>
        <div className="rn-fonts-confirm">
          <p>
            {t('{{name}} will be removed from RNotes. Documents that use it will show another font until it is added again.', {
              name: pendingDelete ?? '',
            })}
          </p>
          <div className="rn-fonts-buttons">
            <button onClick={() => setPendingDelete(null)}>{t('Cancel')}</button>
            <button className="rn-fonts-danger" onClick={() => void handleDelete()}>{t('Delete')}</button>
          </div>
        </div>
      </Modal>
    </>
  )
}
