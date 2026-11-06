import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Editor, Element as SlateElement, Text, Transforms, type NodeEntry, type Range as SlateRange } from "slate";
import { ReactEditor } from "slate-react";
import type { AppSettings } from "../../components/Settings";
import { useRuleLabel } from "../../components/SpellingReview";
import type { EditorInstance } from "../../editorActions";
import {
  addToPersonalDictionary,
  clearSpellingCache,
  isSpellPayload,
  refreshSpellingChecks,
  clipSpellDecorationsToNode,
  getCachedSuggestions as savedSuggestions,
  lookupSuggestions as fetchAllSuggestions,
  type SpellPayload,
} from "../../services/spellcheck";

/**
 * Everything the editor shows about spelling and grammar: the squiggles (as a decoration), the hover
 * card, the right-click target, and the two dialogs behind the Tools menu.
 *
 * The checking itself lives in Rust (`spellcheck.rs`) and the per-block caching in
 * `services/spellcheck.ts`; this decides when to ask and turns the answers into UI.
 */
export function useSpellcheckUi({
  editor,
  settings,
  settingsRef,
  editorVersion,
  activeTabId,
  handleCloseContextMenu,
}: {
  editor: EditorInstance;
  settings: AppSettings;
  settingsRef: { current: AppSettings };
  editorVersion: number;
  activeTabId: string;
  handleCloseContextMenu: () => void;
}) {
  const { i18n: i18nRuntime } = useTranslation();
  const [spellVersion, setSpellVersion] = useState(0);
  const [spellingReviewOpen, setSpellingReviewOpen] = useState(false);
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const [spellTarget, setSpellTarget] = useState<SpellPayload | null>(null);
  const [spellHover, setSpellHover] = useState<{ payload: SpellPayload; x: number; y: number } | null>(null);
  const spellHoverTimer = useRef<number | undefined>(undefined);
  const [hoverSuggestions, setHoverSuggestions] = useState<string[] | null>(null);
  const [targetSuggestions, setTargetSuggestions] = useState<string[] | null>(null);
  const spellRuleLabel = useRuleLabel();

  const spellLanguage = settings.spellcheckLanguage || i18nRuntime.language || 'en';

  /**
   * Issues are stored per block, so this clips each one to the text
   * node being decorated — a misspelled word split by a bold run gets one range per piece, all
   * carrying the same payload for the whole word.
   */
  const decorateSpelling = useCallback(([node, path]: NodeEntry): SlateRange[] => {
    if (!settingsRef.current.spellcheckEnabled || !Text.isText(node)) return []

    const blockEntry = Editor.above(editor, {
      at: path,
      match: (n) => SlateElement.isElement(n) && Editor.isBlock(editor, n),
    })
    if (!blockEntry) return []

    // Is it is block-wide then it is memoised
    return clipSpellDecorationsToNode(blockEntry[0], blockEntry[1], path, node.text.length)
  }, [editor, spellVersion, settings.spellcheckEnabled])

  const runSpellcheck = useCallback(async () => {
    if (!settingsRef.current.spellcheckEnabled) return
    const changed = await refreshSpellingChecks(editor, spellLanguage, () =>
      setSpellVersion((version) => version + 1)
    )
    if (changed) setSpellVersion((version) => version + 1)
  }, [editor, spellLanguage])

  useEffect(() => {
    if (!settings.spellcheckEnabled) return
    const timer = window.setTimeout(() => { void runSpellcheck() }, 400)
    return () => window.clearTimeout(timer)
  }, [runSpellcheck, editorVersion, activeTabId, settings.spellcheckEnabled])

  useEffect(() => {
    clearSpellingCache(editor)
    setSpellVersion((version) => version + 1)
  }, [editor, spellLanguage])

 /** Underlines appearing or leaving re-split blocks into leaves, replacing the DOM node with the caret and causing the browser to drop it to the block start while editor.
  * selection stays correct until the next keystroke where damage becomes visible. 
  * The repair is deferred rather than done in the layout phase because measured when 
  * layout effects run both the DOM and Slate agree and Slate's own selection sync moves it afterwards, 
  * so a later task is the first point where damage is visible. 
  * */

  const repairDomSelection = useCallback(() => {
      if (!editor.selection) return

      const domSelection = window.getSelection()
      if (!domSelection || domSelection.rangeCount === 0) return

      try {
        const editable = ReactEditor.toDOMNode(editor, editor)
        if (!editable.contains(domSelection.anchorNode)) return

        const domRange = ReactEditor.toDOMRange(editor, editor.selection)
        const current = domSelection.getRangeAt(0)
        const agrees =
          current.startContainer === domRange.startContainer &&
          current.startOffset === domRange.startOffset &&
          current.endContainer === domRange.endContainer &&
          current.endOffset === domRange.endOffset
        if (agrees) return

        domSelection.removeAllRanges()
        domSelection.addRange(domRange)
      } catch {
        // the next pass fixes this
      }
  }, [editor])

  useLayoutEffect(() => {
    const id = window.setTimeout(repairDomSelection, 0)
    return () => window.clearTimeout(id)
  }, [repairDomSelection, spellVersion])

  const recheckDocument = useCallback(() => {
    clearSpellingCache(editor)
    void runSpellcheck()
  }, [editor, runSpellcheck])

  /** If clicked, read the payload */
  const readPayloadAt = (target: EventTarget | null): SpellPayload | null => {
    const element = (target as HTMLElement | null)?.closest?.('[data-rn-spell]') as HTMLElement | null;
    if (!element?.dataset.rnSpell) return null;
    try {
      const parsed = JSON.parse(element.dataset.rnSpell);
      return isSpellPayload(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const keepSpellHover = () => window.clearTimeout(spellHoverTimer.current);

  /** Time the pointers need to reach the word*/
  const releaseSpellHover = () => {
    window.clearTimeout(spellHoverTimer.current);
    spellHoverTimer.current = window.setTimeout(() => setSpellHover(null), 250);
  };

  /**
   * The spelling issue arrives without suggestion to be able to paste a large text, each mistake build the grammar rule
   * instead of searching for it
   */
  const loadSuggestions = useCallback(
    async (payload: SpellPayload, apply: (suggestions: string[]) => void) => {
      if (payload.rule !== 'spelling') {
        apply(payload.suggestions);
        return payload.suggestions;
      }
      const known = savedSuggestions(payload.text, spellLanguage);
      if (known) {
        apply(known);
        return known;
      }
      const found = await fetchAllSuggestions(payload.text, spellLanguage);
      apply(found);
      return found;
    },
    [spellLanguage]
  );

  const handleEditorMouseOver = (e: React.MouseEvent) => {
    const payload = readPayloadAt(e.target);
    if (!payload) {
      releaseSpellHover();
      return;
    }
    keepSpellHover();

    const element = (e.target as HTMLElement).closest('[data-rn-spell]') as HTMLElement;
    const rect = element.getBoundingClientRect();

    if (spellHover?.payload.text === payload.text && spellHover.payload.rule === payload.rule) return;

    setSpellHover({ payload, x: rect.left + rect.width / 2, y: rect.bottom + 6 });
    setHoverSuggestions(null);
    void loadSuggestions(payload, (found) => {
      setSpellHover((current) => {
        if (current?.payload.text === payload.text) setHoverSuggestions(found);
        return current;
      });
    });
  };

  const applyWordSuggestion = (payload: SpellPayload, replacement: string) => {
    Transforms.select(editor, payload.range);
    if (replacement) {
      Transforms.insertText(editor, replacement);
    } else {
      Transforms.delete(editor);
    }
    ReactEditor.focus(editor);
  };

  const handleSpellCorrect = async () => {
    handleCloseContextMenu();
    if (!spellTarget) return;

    const suggestions = targetSuggestions ?? (await loadSuggestions(spellTarget, () => {}));
    const replacement = suggestions[0];
    if (replacement === undefined) return;

    applyWordSuggestion(spellTarget, replacement);
  };

  const handleSpellAddWord = async () => {
    handleCloseContextMenu();
    if (!spellTarget) return;
    await addToPersonalDictionary(spellTarget.text);
    recheckDocument();
  };

  return {
    spellLanguage,
    spellRuleLabel,
    spellingReviewOpen, setSpellingReviewOpen,
    dictionaryOpen, setDictionaryOpen,
    spellTarget, setSpellTarget,
    spellHover, setSpellHover,
    hoverSuggestions,
    targetSuggestions, setTargetSuggestions,
    decorateSpelling,
    repairDomSelection,
    recheckDocument,
    readPayloadAt,
    keepSpellHover,
    releaseSpellHover,
    loadSuggestions,
    handleEditorMouseOver,
    applyWordSuggestion,
    handleSpellCorrect,
    handleSpellAddWord,
  };
}
