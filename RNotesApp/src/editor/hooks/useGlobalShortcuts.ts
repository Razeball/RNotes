import { useEffect, type Dispatch, type SetStateAction } from "react";
import { Editor, Transforms } from "slate";
import type { EditorInstance } from "../../editorActions";
import type { TabData } from "../model";

/**
 * The app's keyboard shortcuts, on the window rather than the editable so they work wherever the
 * focus is, plus the guard that keeps the webview's own context menu and devtools keys away.
 *
 * The listener is re-registered when the tabs change, which is when the commands it calls are
 * rebuilt with the new active tab.
 */
export function useGlobalShortcuts({
  editor,
  tabs,
  activeTab,
  activeTabId,
  save,
  saveAs,
  open,
  newDocument,
  print,
  handleNewTab,
  handleTabClose,
  updateTab,
  setShowFindPanel,
}: {
  editor: EditorInstance;
  tabs: TabData[];
  activeTab: TabData;
  activeTabId: string;
  save: () => Promise<void>;
  saveAs: () => Promise<void>;
  open: () => Promise<void>;
  newDocument: () => Promise<void>;
  print: () => Promise<void>;
  handleNewTab: () => Promise<void>;
  handleTabClose: (tabId: string) => Promise<void>;
  updateTab: (updates: Partial<TabData>) => void;
  setShowFindPanel: Dispatch<SetStateAction<boolean>>;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F12' || 
          (e.ctrlKey && e.shiftKey && e.key === 'I') ||
          (e.ctrlKey && e.shiftKey && e.key === 'J') ||
          (e.ctrlKey && e.shiftKey && e.key === 'C') ||
          (e.ctrlKey && e.key === 'u')) {
        e.preventDefault();
        return;
      }

      // AltGr arrives as Ctrl+Alt on Windows, and on many layouts it types characters (Polish
      // AltGr+S is "ś"); a shortcut must never swallow a letter someone is writing.
      if (e.ctrlKey && !e.getModifierState('AltGraph')) {
        // Lower-cased so Caps Lock does not switch every shortcut off: with it on, `e.key` is "S".
        const key = e.key.toLowerCase();

        // Save As answers to both Ctrl+Shift+S and Ctrl+Alt+S. It is checked first because the plain
        // switch below would otherwise take the "s" and run Save — which is what Ctrl+Alt+S did.
        if (key === 's' && (e.shiftKey || e.altKey)) {
          e.preventDefault();
          saveAs();
          return;
        }
        // The rest are plain Ctrl shortcuts. Shift and Alt combinations stay free, as they were
        // before lower-casing made them match.
        if (e.shiftKey || e.altKey) return;

        switch (key){
          case 's':
            // Without it the webview's own "save page" can fire as well.
            e.preventDefault();
            save();
            break;
          case 'o':
            e.preventDefault();
            open();
            break;
          case 'n':
            e.preventDefault();
            newDocument();
            break;
          case 'p':
            e.preventDefault();
            print();
            break;
          case 't':
            e.preventDefault();
            handleNewTab();
            break;
          case 'w':
            e.preventDefault();
            handleTabClose(activeTabId);
            break;
          case 'f':
            e.preventDefault();
            setShowFindPanel(prev => !prev);
            break;
          case 'e':
            e.preventDefault();
            Transforms.select(editor, {
              anchor: Editor.start(editor, []),
              focus: Editor.end(editor, []),
            });
            break;
          case 'd':
            e.preventDefault();
            updateTab({ viewMode: activeTab.viewMode === 'document' ? 'notepad' : 'document' });
            break;
        }
      }
    }


    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      if (!target.closest('.editor-wrapper')) {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("contextmenu", handleContextMenu);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [activeTabId, tabs]);
}
