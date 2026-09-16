import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import WaveText from './WaveText'
import { parseReleaseNotes, type ChangeKind, type Changelog } from '../services/changelog'
import '../styles/UpdateChecker.css'


/** Milliseconds between two letters of a heading, and between one heading and the next. */
const LETTER_STAGGER = 26
const LINE_STAGGER = 180

export function ReleaseContentDialog({
  isOpen,
  onClose,
  release_body: body,
  version,
}: {
  isOpen: boolean
  onClose: () => void
  release_body: string
  version: string
}) {
  const { t } = useTranslation()
  const changelog = parseReleaseNotes(body, version)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="update-modal update-modal-glow"
      title={
        <WaveText
          className="update-version-title"
          text={`v${changelog.version}`}
          stagger={LETTER_STAGGER}
        />
      }
    >
      <div className="update-checker">
        <ReleaseContent changelog={changelog} />
        <div className="update-actions">
          <button className="update-btn update-btn-primary" onClick={onClose}>
            {t('Accept')}</button>
        </div>
      </div>
    </Modal>
  )
}

export function ReleaseContent({ changelog }: { changelog: Changelog }) {
  const { t } = useTranslation()

  if (!changelog.sections.length) {
    return changelog.plain.length ? (
      <ul className="update-plain">
        {changelog.plain.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
    ) : (
      <p className="update-message">{t('The app updated successfully.')}</p>
    )
  }

  return (
    <>
      {changelog.sections.map((section, index) => (
        <div key={index} className={`update-section update-section-${section.kind}`}>
          <p className="update-section-title">
            <WaveText
              text={sectionLabel(section.kind, t)}
              stagger={LETTER_STAGGER}
              delay={(index + 1) * LINE_STAGGER}
            />
          </p>
          <ul className="update-section-items">
            {section.items.map((item, itemIndex) => (
              <li key={itemIndex}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}

function sectionLabel(kind: ChangeKind, t: (key: string) => string): string {
  switch (kind) {
    case 'added':
      return t('Added')
    case 'fixed':
      return t('Fixed')
    case 'changed':
      return t('Changed')
    case 'deleted':
      return t('Deleted')
  }
}
