import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import Dropdown from './Dropdown'
import type { AppSettings } from './Settings'
import { addToPersonalDictionary, fetchPersonalDictionaryEntries, removeFromPersonalDictionary } from '../services/spellcheck'
import '../styles/Spellcheck.css'

/** DictionarySettings is a modal configuration component for managing the spell checker where users can enable/disable correction, 
 * select language and administer custom words. */
type DictionarySettingsProps = {
  isOpen: boolean
  /** Callback to close the modal without saving changes. */
  onClose: () => void
  /** Current user configuration including spellcheck state, language and custom words. */
  settings: AppSettings

  onSettingsChange: (settings: AppSettings) => void

  onDictionaryChanged: () => void
}

/** Interface to change dictionary settings like language or deactivate spellcheking */
export default function DictionarySettings({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  onDictionaryChanged,
}: DictionarySettingsProps) {
  const { t } = useTranslation()
  const [words, setWords] = useState<string[]>([])
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (isOpen) void fetchPersonalDictionaryEntries().then(setWords)
  }, [isOpen])

 /** Language options list where the first allows following system language and the next ones are English and Spanish. */
  const languageOptions = [
    { value: '', label: t("Follow the interface") },
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Español' },
  ]

   /** Applies updated word list immediately and notifies that dictionary has changed to restart detection. */
  const commit = (updated: string[]) => {
    setWords(updated)
    onDictionaryChanged()
  }

   /** Adds word from text field to personal dictionary after trimming and clearing the input. */
  const add = async () => {
    const word = draft.trim()
    if (!word) return
    setDraft('')
    commit(await addToPersonalDictionary(word))
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("Dictionary")}>
      <div className="rn-dictionary">
        <div className="rn-dictionary-row">
          <span>{t("Check spelling while you type")}</span>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={settings.spellcheckEnabled}
              onChange={(e) => onSettingsChange({ ...settings, spellcheckEnabled: e.target.checked })}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        <div className="rn-dictionary-row">
          <span>{t("Dictionary language")}</span>
          <Dropdown
            options={languageOptions}
            selectedValue={settings.spellcheckLanguage}
            onSelect={(value) => onSettingsChange({ ...settings, spellcheckLanguage: value })}
            renderButton={(value, _isOpen, toggle) => (
              <button onMouseDown={(e) => { e.preventDefault(); toggle() }}>
                {languageOptions.find((option) => option.value === value)?.label ?? value}
              </button>
            )}
          />
        </div>

        <div className="rn-dictionary-add">
          <input
            type="text"
            value={draft}
            placeholder={t("Add a word")}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add()
            }}
          />
          <button onClick={() => void add()}>{t("Add")}</button>
        </div>

        {words.length === 0 ? (
          <div className="rn-dictionary-empty">{t("You have not added any words yet.")}</div>
        ) : (
          <div className="rn-dictionary-words">
            {words.map((word) => (
              <div className="rn-dictionary-word" key={word}>
                <span>{word}</span>
                <button onClick={async () => commit(await removeFromPersonalDictionary(word))}>
                  {t("Remove")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
