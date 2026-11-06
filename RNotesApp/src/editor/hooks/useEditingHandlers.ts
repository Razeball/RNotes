import React, { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Editor, Element as SlateElement, Range as SlateRange, Transforms, type Descendant } from "slate";
import type { AppSettings } from "../../components/Settings";
import { insertImage, type EditorInstance } from "../../editorActions";
import { HEADING_TYPES, type CustomElement } from "../model";
import { processMarkdownSpace, detectsMarkdownText } from "../../services/markdownInput";
import { clearPageSpacers, hasPageSpacers } from "../../services/pageSpacers";
import { shouldBeSoundedKey, triggerMechanicalKeyClick } from "../../services/keySound";

/**
 * What the editable does with input before Slate does: pasting images and markdown, what Enter
 * carries to the next line, the keys a table refuses, markdown-as-you-type on space, the typing
 * sound, and deleting across page spacers.
 *
 * Both view modes receive these through the same `EditableSurfaceProps`, so they cannot drift.
 */
export function useEditingHandlers({
  editor,
  settingsRef,
  activeTabId,
  trackKeystroke,
  repairDomSelection,
}: {
  editor: EditorInstance;
  settingsRef: { current: AppSettings };
  activeTabId: string;
  trackKeystroke: () => void;
  repairDomSelection: () => void;
}) {
  const handlePaste = useCallback(async (event: React.ClipboardEvent) => {
    const clipboardData = event.clipboardData;
    

    if (clipboardData.files && clipboardData.files.length > 0) {
      const file = clipboardData.files[0];
      if (file.type.startsWith('image/')) {
        event.preventDefault();
        try {
          const filePath = await invoke<string>("insert_image_from_clipboard", { tabId: activeTabId });
          insertImage(editor, filePath);
        } catch (error) {
          console.error("Error pasting image:", error);
        }
        return;
      }
    }
    

    // Markdown text becomes real formatting based on the real file.
    if (settingsRef.current.markdownEnabled) {
      const clipboardText = clipboardData.getData('text/plain');
      if (clipboardText && detectsMarkdownText(clipboardText)) {
        event.preventDefault();
        try {
          const nodes = await invoke<Descendant[]>("parse_markdown", { text: clipboardText });
          if (nodes.length > 0) Transforms.insertFragment(editor, nodes);
          return;
        } catch (error) {
          console.error("The markdown format parsing has failed, falling back to plain text:", error);
          Transforms.insertText(editor, clipboardText);
          return;
        }
      }
    }

    const items = clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        event.preventDefault();
        try {
          const filePath = await invoke<string>("insert_image_from_clipboard", { tabId: activeTabId });
          insertImage(editor, filePath);
        } catch (error) {
          console.error("Error pasting image:", error);
        }
        return;
      }
    }
  }, [editor, activeTabId]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {

    if (event.key === 'Enter') {
      const { selection } = editor;
      if (!selection) return;

      const [imageNode] = Editor.nodes(editor, {
        match: (n: any) => n.type === 'image',
        mode: 'lowest',
      });

      if (imageNode) {
        event.preventDefault();
        const [, imagePath] = imageNode;
        const newParagraph: CustomElement = {
          type: 'paragraph',
          children: [{ text: '' }],
        };
        Transforms.insertNodes(editor, newParagraph, { at: [imagePath[0] + 1] });
        Transforms.select(editor, [imagePath[0] + 1, 0]);
        return;
      }

      const [checkNode] = Editor.nodes(editor, {
        match: (n: any) => n.type === 'check',
        mode: 'lowest',
      });

      if (checkNode) {
        event.preventDefault();
        editor.insertBreak();
        Transforms.setNodes(editor, { checked: false }, {
          match: (n: any) => n.type === 'check',
        });
        return;
      }

      // Only list can carry their shape to the other lane
      if (SlateRange.isCollapsed(selection)) {
        const [blockNode] = Editor.nodes(editor, {
          match: (n) => SlateElement.isElement(n) && Editor.isBlock(editor, n),
          mode: 'lowest',
        });

        const isLeavingBlock = blockNode != null && Editor.isEnd(editor, selection.anchor, blockNode[1]);
        const isBlockHeading = isLeavingBlock && HEADING_TYPES.has((blockNode[0] as CustomElement).type);
        const conveysQuote = isLeavingBlock && Editor.marks(editor)?.quote === true;

        if (isBlockHeading || conveysQuote) {
          event.preventDefault();
          editor.insertBreak();
          if (isBlockHeading) {
            Transforms.setNodes(editor, { type: 'paragraph' }, {
              match: (n: any) => HEADING_TYPES.has(n.type),
            });
          }
          if (conveysQuote) Editor.removeMark(editor, 'quote');
          return;
        }
      }
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      const { selection } = editor;
      if (!selection) return;

      const [tableCell] = Editor.nodes(editor, {
        match: (n: any) => n.type === 'table-cell',
        mode: 'lowest',
      });

      if (tableCell) {
        const [, cellPath] = tableCell;

        const cellText = Editor.string(editor, cellPath);
        

        if (cellText === '') {
          event.preventDefault();
          return;
        }
        

        return;
      }


      const [tableNode] = Editor.nodes(editor, {
        match: (n: any) => n.type === 'table' || n.type === 'table-row',
        mode: 'lowest',
      });

      if (tableNode) {
        event.preventDefault();
        return;
      }
    }
  }, [editor]);

  const handleEditKeyDownEvent = useCallback((event: React.KeyboardEvent) => {
    // 'beforeinput' follows the DOM selection so the decorations changes can move, this mark the last moment where a character can land.
    repairDomSelection();

    if (settingsRef.current.keySoundEnabled && shouldBeSoundedKey(event)) triggerMechanicalKeyClick();

    if (
      event.key === ' ' &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      settingsRef.current.markdownEnabled &&
      processMarkdownSpace(editor)
    ) {
      event.preventDefault();
      trackKeystroke();
      return;
    }

    handleKeyDown(event);
    if (event.key.length === 1) trackKeystroke();
  }, [editor, handleKeyDown, trackKeystroke, repairDomSelection]);

  const handleDOMBeforeInput = useCallback((event: InputEvent) => {
    if (!event.inputType.startsWith('delete')) return;
    if (!hasPageSpacers(editor)) return;

    event.preventDefault();
    clearPageSpacers(editor);

    const { selection } = editor;
    if (selection && SlateRange.isExpanded(selection)) {
      Editor.deleteFragment(editor);
      return;
    }

    switch (event.inputType) {
      case 'deleteWordBackward':
        Editor.deleteBackward(editor, { unit: 'word' });
        break;
      case 'deleteContentForward':
        Editor.deleteForward(editor, { unit: 'character' });
        break;
      case 'deleteWordForward':
        Editor.deleteForward(editor, { unit: 'word' });
        break;
      default:
        Editor.deleteBackward(editor, { unit: 'character' });
        break;
    }
  }, [editor]);

  return { handlePaste, handleEditKeyDownEvent, handleDOMBeforeInput };
}
