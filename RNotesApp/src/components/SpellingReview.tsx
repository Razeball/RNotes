import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ReactEditor } from 'slate-react'
import Modal from './Modal'
import type { EditorInstance } from '../editorActions'
import {
  batchApplySuggestedCorrections,
  applySuggestedReplacement,
  lookupSuggestions,
  collectAllLocatedIssues,
  refreshSpellingChecks,
  type LocatedIssue,
} from '../services/spellcheck'
import '../styles/Spellcheck.css'

type SpellingReviewProps = {
  isOpen: boolean
  onClose: () => void
  editor: EditorInstance
  language: string
  onCorrected: () => void
}

/** rule id base on backend reports */
export function useRuleLabel() {
  const { t } = useTranslation()

  return (rule: string) => {
    switch (rule) {
      case 'repeated-word':
        return t("Repeated word")
      case 'double-space':
        return t("Double space")
      case 'space-before-punctuation':
        return t("Space before punctuation")
      case 'lowercase-after-period':
        return t("Sentence should start with a capital letter")
      default:
        return t("Not in dictionary")
    }
  }
}

export default function SpellingReview({ isOpen, onClose, editor, language, onCorrected }: SpellingReviewProps) {
  const { t } = useTranslation()
  const ruleLabel = useRuleLabel()

  const [issues, setIssues] = useState<LocatedIssue[]>([])
  const [scanning, setScanning] = useState(false)
  const [resolved, setResolved] = useState(0)

  const rescan = useCallback(async () => {
    setScanning(true)
    setResolved(0)
    try {
      await refreshSpellingChecks(editor, language)
      const found = collectAllLocatedIssues(editor)
      setIssues(found)
      setScanning(false)

      const filled = [...found]
      for (let index = 0; index < filled.length; index += 1) {
        const issue = filled[index]
        if (issue.suggestions.length > 0) continue

        filled[index] = { ...issue, suggestions: await lookupSuggestions(issue.text, language) }
        setResolved(index + 1)
        if (index % 10 === 9) setIssues([...filled])
      }
      setIssues(filled)
      setResolved(filled.length)
    } finally {
      setScanning(false)
    }
  }, [editor, language])

  useEffect(() => {
    if (isOpen) void rescan()
  }, [isOpen, rescan])


  const afterEdit = async () => {
    onCorrected()
    await rescan()
  }

  const correctSingleWord = async (issue: LocatedIssue) => {
    const replacement = issue.suggestions[0]
    if (replacement === undefined) return
    applySuggestedReplacement(editor, issue, replacement)
    ReactEditor.focus(editor)
    await afterEdit()
  }

  const correctAllWords = async () => {
    batchApplySuggestedCorrections(editor, issues)
    ReactEditor.focus(editor)
    await afterEdit()
  }

  const fixable = issues.filter((issue) => issue.suggestions.length > 0)
  const looking = !scanning && issues.length > 0 && resolved < issues.length

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("Check spelling and grammar")}>
      <div className="rn-review">
        {scanning && <div className="rn-review-empty">{t("Checking the document...")}</div>}

        {!scanning && issues.length === 0 && (
          <div className="rn-review-empty">{t("No spelling or grammar issues found.")}</div>
        )}

        {!scanning && issues.length > 0 && (
          <>
            <div className="rn-review-list">
              {issues.map((issue, index) => (
                <div className="rn-review-item" key={`${issue.blockPath.join('.')}-${issue.start}-${index}`}>
                  <div className="rn-review-item-body">
                    <span className="rn-review-word">
                      {issue.rule === 'double-space' ? t("(double space)") : issue.text}
                    </span>
                    <span className="rn-review-rule">
                      {ruleLabel(issue.rule)}
                      {issue.suggestions.length > 0 && (
                        <>
                          {' → '}
                          <span className="rn-review-fix">
                            {issue.suggestions[0] === '' ? t("(remove)") : issue.suggestions[0]}
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                  <button disabled={issue.suggestions.length === 0} onClick={() => void correctSingleWord(issue)}>
                    {t("Correct")}
                  </button>
                </div>
              ))}
            </div>

            <div className="rn-review-actions">
              <button onClick={onClose}>{t("Close")}</button>
              {looking && (
                <span className="rn-review-progress">
                  {t("Looking for suggestions... ({{done}}/{{total}})", {
                    done: resolved,
                    total: issues.length,
                  })}
                </span>
              )}
              <button disabled={fixable.length === 0 || looking} onClick={() => void correctAllWords()}>
                {t("Correct all ({{count}})", { count: fixable.length })}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
