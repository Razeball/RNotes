import { useState, useEffect, useRef, useCallback } from 'react'
import { EditorInstance, findTextMatches, SearchMatch, replaceMatch, replaceAllMatches } from '../editorActions'
import { ReactEditor } from 'slate-react'
import '../styles/FindReplacePanel.css'

interface FindReplacePanelProps {
  editor: EditorInstance
  isOpen: boolean
  onClose: () => void
  onMatchesChange: (matches: SearchMatch[], currentIndex: number) => void
}

const FindReplacePanel = ({ editor, isOpen, onClose, onMatchesChange }: FindReplacePanelProps) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [replaceTerm, setReplaceTerm] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [matchWholeWord, setMatchWholeWord] = useState(false)
  const [showReplace, setShowReplace] = useState(false)
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const runSearch = useCallback(() => {
    if (!searchTerm) {
      setMatches([])
      setCurrentMatchIndex(-1)
      onMatchesChange([], -1)
      return
    }
    const found = findTextMatches(editor, searchTerm, matchCase, matchWholeWord)
    setMatches(found)
    const newIndex = found.length > 0 ? 0 : -1
    setCurrentMatchIndex(newIndex)
    onMatchesChange(found, newIndex)
  }, [editor, searchTerm, matchCase, matchWholeWord, onMatchesChange])

  useEffect(() => {
    runSearch()
  }, [runSearch])

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus()
      searchInputRef.current.select()
    }
  }, [isOpen])

  const scrollToMatch = useCallback((match: SearchMatch) => {
    try {
      const range = {
        anchor: { path: match.path, offset: match.offset },
        focus: { path: match.path, offset: match.offset + match.length },
      }
      ReactEditor.focus(editor)
      const domRange = ReactEditor.toDOMRange(editor, range)
      const rect = domRange.getBoundingClientRect()
      const container = document.querySelector('.editor-content') || document.querySelector('.pv-scroll-area')
      if (container) {
        const containerRect = container.getBoundingClientRect()
        if (rect.top < containerRect.top || rect.bottom > containerRect.bottom) {
          const target = domRange.startContainer.parentElement
          target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }
    } catch {
    }
  }, [editor])

  const goToNext = useCallback(() => {
    if (matches.length === 0) return
    const newIndex = (currentMatchIndex + 1) % matches.length
    setCurrentMatchIndex(newIndex)
    onMatchesChange(matches, newIndex)
    scrollToMatch(matches[newIndex])
  }, [matches, currentMatchIndex, onMatchesChange, scrollToMatch])

  const goToPrev = useCallback(() => {
    if (matches.length === 0) return
    const newIndex = (currentMatchIndex - 1 + matches.length) % matches.length
    setCurrentMatchIndex(newIndex)
    onMatchesChange(matches, newIndex)
    scrollToMatch(matches[newIndex])
  }, [matches, currentMatchIndex, onMatchesChange, scrollToMatch])

  const handleReplace = useCallback(() => {
    if (currentMatchIndex < 0 || currentMatchIndex >= matches.length) return
    replaceMatch(editor, matches[currentMatchIndex], replaceTerm)
    setTimeout(() => {
      const found = findTextMatches(editor, searchTerm, matchCase, matchWholeWord)
      setMatches(found)
      const newIndex = found.length > 0 ? Math.min(currentMatchIndex, found.length - 1) : -1
      setCurrentMatchIndex(newIndex)
      onMatchesChange(found, newIndex)
    }, 0)
  }, [editor, matches, currentMatchIndex, replaceTerm, searchTerm, matchCase, matchWholeWord, onMatchesChange])

  const handleReplaceAll = useCallback(() => {
    if (matches.length === 0) return
    replaceAllMatches(editor, searchTerm, replaceTerm, matchCase, matchWholeWord)
    setTimeout(() => {
      const found = findTextMatches(editor, searchTerm, matchCase, matchWholeWord)
      setMatches(found)
      setCurrentMatchIndex(found.length > 0 ? 0 : -1)
      onMatchesChange(found, found.length > 0 ? 0 : -1)
    }, 0)
  }, [editor, matches, searchTerm, replaceTerm, matchCase, matchWholeWord, onMatchesChange])

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) {
        goToPrev()
      } else {
        goToNext()
      }
    }
    if (e.key === 'Escape') {
      onClose()
    }
  }

  const handleReplaceKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleReplace()
    }
    if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="find-replace-panel" onKeyDown={(e) => e.stopPropagation()}>
      <div className="find-replace-row">
        <button
          className={`find-replace-expand ${showReplace ? 'expanded' : ''}`}
          onClick={() => setShowReplace(!showReplace)}
          title="Toggle Replace"
        >
          ▶
        </button>
        <input
          ref={searchInputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Find"
        />
        <button
          className={`find-replace-btn ${matchCase ? 'active' : ''}`}
          onClick={() => setMatchCase(!matchCase)}
          title="Match Case"
        >
          Aa
        </button>
        <button
          className={`find-replace-btn ${matchWholeWord ? 'active' : ''}`}
          onClick={() => setMatchWholeWord(!matchWholeWord)}
          title="Match Whole Word"
        >
          Ab
        </button>
        <span className="find-match-count">
          {matches.length > 0 ? `${currentMatchIndex + 1} of ${matches.length}` : 'No results'}
        </span>
        <div className="find-replace-actions">
          <button className="find-replace-btn" onClick={goToPrev} title="Previous Match (Shift+Enter)">
            ↑
          </button>
          <button className="find-replace-btn" onClick={goToNext} title="Next Match (Enter)">
            ↓
          </button>
        </div>
        <button className="find-replace-close" onClick={onClose} title="Close (Escape)">
          ✕
        </button>
      </div>
      {showReplace && (
        <div className="find-replace-row" style={{ paddingLeft: 24 }}>
          <input
            type="text"
            value={replaceTerm}
            onChange={(e) => setReplaceTerm(e.target.value)}
            onKeyDown={handleReplaceKeyDown}
            placeholder="Replace"
          />
          <div className="find-replace-actions">
            <button className="find-replace-btn" onClick={handleReplace} title="Replace">
              Replace
            </button>
            <button className="find-replace-btn" onClick={handleReplaceAll} title="Replace All">
              All
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default FindReplacePanel
