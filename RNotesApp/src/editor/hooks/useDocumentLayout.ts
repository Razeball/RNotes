import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Editor, type Descendant } from "slate";
import type { EditorInstance } from "../../editorActions";
import type { TabData } from "../model";
import { buildLineIndex, getVisualPosition, type LineEntry } from "../../services/lineIndex";
import type { PaginationResult } from "../../services/pagination";
import { clearPageSpacers, reconcilePageSpacers, textOffsetOfPoint } from "../../services/pageSpacers";

/** How many spacer rewrite are allowed per user edit. */
const MAX_SPACER_REWRITE_PER_EDIT = 4;

/**
 * What the status bar and the document view need to know about the layout: the caret's *visual*
 * line and column, the character count, and the page-spacer bookkeeping that keeps pagination from
 * being mistaken for an edit.
 *
 * `spacerVoidRef` is raised whenever spacers are inserted or cleared, so the content-changed check
 * in the editor knows that change was layout. `reconcileCapRef` counts spacer rewrites per user
 * edit — see MAX_SPACER_REWRITE_PER_EDIT.
 */
export function useDocumentLayout({
  editor,
  activeTab,
  activeTabId,
  editorVersion,
  zoomLevel,
}: {
  editor: EditorInstance;
  activeTab: TabData;
  activeTabId: string;
  editorVersion: number;
  zoomLevel: number;
}) {
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const [characterCount, setCharacterCount] = useState(0);
  const visualLinesRef = useRef<LineEntry[]>([]);
  const notepadRef = useRef<HTMLDivElement>(null);
  // mark the tab dirty so it can diferentiate that gaps are layout not content.
  const spacerVoidRef = useRef(false);
  // Capping the rewrites per user edit means so the worst case is stale pagination
  const reconcileCapRef = useRef(0);

  const calculateCharacterCount = useCallback((nodes: Descendant[]): number => {
    let count = 0;
    const countText = (node: any) => {
      if ('text' in node) {
        count += node.text.length;
      } else if ('children' in node) {
        node.children.forEach(countText);
      }
    };
    nodes.forEach(countText);
    return count;
  }, []);

  const updateCursorPosition = useCallback(() => {
    const { selection } = editor;
    const next = selection
      ? getVisualPosition(editor, visualLinesRef.current, Editor.edges(editor, selection)[0])
      : { line: 1, column: 1 };
    // runs after pagination pass
    setCursorPosition((previous) =>
      previous.line === next.line && previous.column === next.column ? previous : next
    );
  }, [editor]);

  const handlePaginationChange = useCallback((result: PaginationResult) => {
    visualLinesRef.current = result.lines;
    // Refreshed here instead of an effect avoid errors
    updateCursorPosition();

    // Break points are converted to canonical text offsets so it not depend from spacers
    const desiredResult = result.breaks.flatMap((item) =>
      item.kind === 'line'
        ? [{
            blockIndex: item.blockIndex,
            textOffset: textOffsetOfPoint(editor, item.blockIndex, item.point),
            height: item.gapPx,
          }]
        : []
    );

    if (reconcileCapRef.current >= MAX_SPACER_REWRITE_PER_EDIT) return;

    if (reconcilePageSpacers(editor, desiredResult)) {
      reconcileCapRef.current += 1;
      spacerVoidRef.current = true;
    }
  }, [editor, updateCursorPosition]);

  // Ln/Col reports the *visual* line, so it needs line-box measurement in both modes. 
  useLayoutEffect(() => {
    if (activeTab.viewMode === 'document') return;
    const editable = notepadRef.current?.querySelector('[data-slate-editor="true"]');
    visualLinesRef.current = editable ? buildLineIndex(editor, editable as HTMLElement) : [];
    updateCursorPosition();
  }, [editor, editorVersion, activeTabId, activeTab.viewMode, zoomLevel, updateCursorPosition]);

  useEffect(() => {
    if (activeTab.viewMode === 'document') return;
    if (clearPageSpacers(editor)) spacerVoidRef.current = true;
  }, [editor, activeTab.viewMode, activeTab.value]);

  useEffect(() => {
    setCharacterCount(calculateCharacterCount(activeTab.value));
  }, [activeTab.value, calculateCharacterCount]);

  return {
    cursorPosition,
    characterCount,
    notepadRef,
    spacerVoidRef,
    reconcileCapRef,
    updateCursorPosition,
    handlePaginationChange,
  };
}
