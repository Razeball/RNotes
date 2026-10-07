import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import '../styles/DropOverlay.css'

export type DropKind = 'document' | 'image' | 'unsupported'

export interface DroppedFile {
  path: string
  name: string
  kind: DropKind
}

const MAX_LISTED = 5

export default function DropOverlay({ onDrop }: { onDrop: (files: DroppedFile[]) => void }) {
  const { t } = useTranslation()
  const [files, setFiles] = useState<DroppedFile[] | null>(null)
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false

    let generation = 0

    const classify = (paths: string[]) =>
      invoke<DroppedFile[]>('classify_dropped_files', { paths }).catch(() =>
        paths.map((path) => ({ path, name: path, kind: 'unsupported' as const })),
      )

    getCurrentWebview()
      .onDragDropEvent(async (event) => {
        const payload = event.payload
        if (payload.type === 'enter') {
          const mine = ++generation
          const classified = await classify(payload.paths)
          if (mine === generation) setFiles(classified)
        } else if (payload.type === 'leave') {
          generation++
          setFiles(null)
        } else if (payload.type === 'drop') {
          generation++
          setFiles(null)
          onDropRef.current(await classify(payload.paths))
        }
      })
      .then((fn) => {
        if (cancelled) fn()
        else unlisten = fn
      })
      .catch(() => {})

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  if (!files) return null

  const listed = files.slice(0, MAX_LISTED)
  const hidden = files.length - listed.length
  const nothingUsable = files.every((file) => file.kind === 'unsupported')

  return createPortal(
    <div className="drop-overlay" role="dialog" aria-modal="true" aria-label={t('Drop files here')}>
      <div className={`drop-zone ${nothingUsable ? 'drop-zone-refused' : ''}`}>
        <svg className="drop-icon" viewBox="0 0 48 48" aria-hidden="true">
          <path d="M24 6v24M14 21l10 10 10-10" />
          <path d="M8 32v6a4 4 0 0 0 4 4h24a4 4 0 0 0 4-4v-6" />
        </svg>
        <p className="drop-title">
          {nothingUsable ? t("RNotes can't open these files") : t('Drop files here')}
        </p>
        <p className="drop-subtitle">
          {nothingUsable
            ? t('RNotes opens documents (.rdocx, .md, .txt, .json) and images (.png, .jpg, .gif, .webp, .bmp).')
            : t('Documents open in a new tab. Images go into the current document.')}
        </p>

        <ul className="drop-list">
          {listed.map((file) => (
            <li key={file.path} className={`drop-item drop-item-${file.kind}`}>
              <span className="drop-name">{file.name}</span>
              <span className="drop-badge">{kindLabel(file.kind, t)}</span>
            </li>
          ))}
          {hidden > 0 && <li className="drop-more">+{hidden}</li>}
        </ul>
      </div>
    </div>,
    document.body,
  )
}

function kindLabel(kind: DropKind, t: (key: string) => string): string {
  switch (kind) {
    case 'document':
      return t('Opens in a new tab')
    case 'image':
      return t('Inserted as image')
    case 'unsupported':
      return t('Not supported')
  }
}
