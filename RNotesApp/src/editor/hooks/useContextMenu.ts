import React from "react";
import { useTranslation } from "react-i18next";
import { Editor, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import type { ContextMenuItem } from "../../components/ContextMenu";
import { removeLink as removeLinkAction, type EditorInstance, type EditorWithLinkActions } from "../../editorActions";
import type { useSpellcheckUi } from "./useSpellcheckUi";

type SpellMenuParts = Pick<
  ReturnType<typeof useSpellcheckUi>,
  | 'spellTarget'
  | 'setSpellTarget'
  | 'targetSuggestions'
  | 'setTargetSuggestions'
  | 'readPayloadAt'
  | 'loadSuggestions'
  | 'handleSpellCorrect'
  | 'handleSpellAddWord'
>;

/**
 * The editor's right-click menu: clipboard, selection, find, links, and — when the click landed on
 * a flagged word — the spelling fix and "add to dictionary". Opening it records which word was
 * under the pointer and starts fetching its suggestion.
 */
export function useContextMenu({
  editor,
  setContextMenu,
  handleCloseContextMenu,
  setShowFindPanel,
  spellTarget,
  setSpellTarget,
  targetSuggestions,
  setTargetSuggestions,
  readPayloadAt,
  loadSuggestions,
  handleSpellCorrect,
  handleSpellAddWord,
}: {
  editor: EditorInstance;
  setContextMenu: (position: { x: number; y: number } | null) => void;
  handleCloseContextMenu: () => void;
  setShowFindPanel: (open: boolean) => void;
} & SpellMenuParts) {
  const { t } = useTranslation();
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const payload = readPayloadAt(e.target);
    setSpellTarget(payload);
    setTargetSuggestions(null);
    if (payload) void loadSuggestions(payload, setTargetSuggestions);
    setContextMenu({ x: e.clientX, y: e.clientY });
  };









  const handleCopy = () => {
    const { selection } = editor;
    if (selection) {
      const selectedText = Editor.string(editor, selection);
      navigator.clipboard.writeText(selectedText);
    }
    handleCloseContextMenu();
  };

  const handleCut = () => {
    const { selection } = editor;
    if (selection) {
      const selectedText = Editor.string(editor, selection);
      navigator.clipboard.writeText(selectedText);
      Transforms.delete(editor, { at: selection });
    }
    handleCloseContextMenu();
  };

  const handlePasteFromContextMenu = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        editor.insertText(text);
      }
    } catch (error) {
      console.error("Error pasting text:", error);
    }
    handleCloseContextMenu();
  };

  const handleInsertLink = () => {
    handleCloseContextMenu();
    const linkActions = (editor as EditorWithLinkActions).linkActions;
    if (linkActions) {
      linkActions.openLinkModal();
    }
  };

  const handleLinkToHeader = () => {
    handleCloseContextMenu();
    const linkActions = (editor as EditorWithLinkActions).linkActions;
    if (linkActions) {
      linkActions.openHeaderLinkModal();
    }
  };

  const handleRemoveLink = () => {
    handleCloseContextMenu();
    removeLinkAction(editor);
  };

  const handleSelectAll = () => {
    handleCloseContextMenu();
    setTimeout(() => {
      ReactEditor.focus(editor);
      Transforms.select(editor, {
        anchor: Editor.start(editor, []),
        focus: Editor.end(editor, []),
      });
    }, 0);
  };

  const handleFindFromContextMenu = () => {
    handleCloseContextMenu();
    setShowFindPanel(true);
  };

  const contextMenuItems: ContextMenuItem[] = [
    { id: 'copy', label: t("Copy"), onClick: handleCopy },
    { id: 'cut', label: t("Cut"), onClick: handleCut },
    { id: 'paste', label: t("Paste"), onClick: handlePasteFromContextMenu, divider: true },
    { id: 'selectAll', label: t("Select All"), shortcut: 'Ctrl+E', onClick: handleSelectAll },
    { id: 'find', label: t("Find"), shortcut: 'Ctrl+F', onClick: handleFindFromContextMenu, divider: true },
    { id: 'insertLink', label: t("Insert Link"), onClick: handleInsertLink },
    { id: 'linkToHeader', label: t("Link to Header"), onClick: handleLinkToHeader },
    { id: 'removeLink', label: t("Remove Link"), onClick: handleRemoveLink },
    ...(spellTarget && (spellTarget.rule === 'spelling' || spellTarget.suggestions.length > 0)
      ? [{
          id: 'spellCorrect',
          label: t("Correct"),
          shortcut: targetSuggestions?.[0] || undefined,
          onClick: () => void handleSpellCorrect(),
          divider: spellTarget.rule !== 'spelling',
        }]
      : []),
    ...(spellTarget?.rule === 'spelling'
      ? [{ id: 'spellAdd', label: t("Add to dictionary"), onClick: handleSpellAddWord, divider: true }]
      : []),
  ];

  return { handleContextMenu, contextMenuItems };
}
