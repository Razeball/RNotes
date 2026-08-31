import { useTranslation } from 'react-i18next';
import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { createEditor, Descendant, BaseEditor, Transforms, Editor, Element as SlateElement, Range as SlateRange, NodeEntry, Text } from "slate";

import {
  Slate,
  Editable,
  withReact,
  RenderElementProps,
  RenderLeafProps,
  ReactEditor,
} from "slate-react";
import { withHistory, HistoryEditor } from "slate-history";
import Toolbar from "./components/Toolbar";
import { invoke } from "@tauri-apps/api/core";
import Miscellaneousbar from "./components/Miscellaneousbar";
import React from "react";
import Popup from "./components/Popup";
import { TableElement} from "./components/Table";
import ActionDropdown, { ActionDropdownItem } from "./components/ActionDropdown";
import ContextMenu, { ContextMenuItem } from "./components/ContextMenu";
import ImageElement from "./components/ImageElement";
import CheckItemElement from "./components/CheckItem";
import SpellingReview, { useRuleLabel } from "./components/SpellingReview";
import DictionarySettings from "./components/DictionarySettings";
import StatusBar from "./components/StatusBar";
import TabBar, { Tab } from "./components/TabBar";
import Settings, { AppSettings, defaultSettings, ViewMode } from "./components/Settings";
import PageView, { EditableSurfaceProps } from "./components/PageView";
import { EditorWithLinkActions, removeLink as removeLinkAction, SearchMatch, type EditorInstance } from "./editorActions";
import { getCssPageSize, getPageModel } from "./models/pageModel";
import FindReplacePanel from "./components/FindReplacePanel";
import { useAlert } from "./components/Notice";
import { 	activatePreferredUserLanguage } from "./i18n";
import { processMarkdownSpace, detectsMarkdownText } from "./services/markdownInput";
import { buildLineIndex, getVisualPosition, type LineEntry } from "./services/lineIndex";
import type { PaginationResult } from "./services/pagination";
import {
  PAGE_SPACER_ATTR,
  PAGE_SPACER_TYPE,
  clearPageSpacers,
  hasPageSpacers,
  reconcilePageSpacers,
  stripPageSpacers,
  textOffsetOfPoint,
} from "./services/pageSpacers";
import {
  addToPersonalDictionary,
  invalidateSpellCheckCache,
  isSpellPayload,
  updateSpellingChecks,
  extractSpellRangesFromNode,
  type SpellPayload,
} from "./services/spellcheck";
import "./styles/Spellcheck.css";


export type ImageSize = "small" | "medium" | "large" | "original";

export type CustomElement = {
  type:
    | "paragraph"
    | "header"
    | "header2"
    | "header3"
    | "header4"
    | "ulist"
    | "olist"
    | "list-item"
    | "check"
    | "image"
    | "table"
    | "table-row"
    | "table-cell"
    | "page-spacer";
  children: CustomText[] | CustomElement[];
  alignment?: "start" | "center" | "end" | "justify";
  url?: string;
  size?: ImageSize;
  caption?: string;
  subtitle?: string;
  title?: string;
  id?: string;
  checked?: boolean;
  /** Only used for page-space, never saved */
  height?: number;
};
export type CustomText = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  code?: boolean;
  quote?: boolean;
  highlight?: boolean;
  link?: boolean;
  href?: string;
  fontSize?: number;
  crossedOut?: boolean;
  color?: "red" | "blue" | "white" | "black" | "green";
  fontFamily?: string;
};

const HEADING_TYPES = new Set<CustomElement["type"]>(["header", "header2", "header3", "header4"]);

declare module "slate" {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor & HistoryEditor;
    Element: CustomElement;
    Text: CustomText;
  }
}


const withImages = <T extends BaseEditor>(editor: T): T => {
  const { isVoid, isInline } = editor;

  editor.isVoid = (element) => {
    return element.type === 'image' ? true : isVoid(element);
  };

  editor.isInline = (element) => {
    return element.type === 'image' ? false : isInline(element);
  };

  return editor;
};

/**
 * Page gaps are void nodes so Slate's own machinery carries the selection through them.
 */
const pageWithSpacers = <T extends BaseEditor>(editor: T): T => {
  const { isVoid, isInline, deleteBackward, deleteForward, deleteFragment, insertBreak } = editor;

  editor.isVoid = (element) => (element.type === PAGE_SPACER_TYPE ? true : isVoid(element));
  editor.isInline = (element) => (element.type === PAGE_SPACER_TYPE ? true : isInline(element));

  // Clearing them first sidesteps the whole class of interaction. So the next pagination put it back
  const pageWithoutSpacers = <R,>(operation: () => R): R => {
    clearPageSpacers(editor as unknown as EditorInstance);
    return operation();
  };

  editor.deleteBackward = (unit) => pageWithoutSpacers(() => deleteBackward(unit));
  editor.deleteForward = (unit) => pageWithoutSpacers(() => deleteForward(unit));
  editor.deleteFragment = (options) => pageWithoutSpacers(() => deleteFragment(options));
  editor.insertBreak = () => pageWithoutSpacers(() => insertBreak());

  return editor;
};

/** How many spacer rewrite are allowed per user edit. */
const MAX_SPACER_REWRITE_PER_EDIT = 4;

const initialValue: Descendant[] = [
  {
    type: "paragraph",
    alignment: "start",
    children: [{ text: "" }],
  },
];

const Element = ({ attributes, children, element }: RenderElementProps) => {
  let style: React.CSSProperties = element.alignment
    ? { textAlign: `${element.alignment}` }
    : {};
  switch (element.type) {
    case "paragraph":
      return (
        <p {...attributes} style={style}>
          {children}
        </p>
      );
    case "image":
      return <ImageElement attributes={attributes} children={children} element={element} />;
    case "page-spacer":
      return (
        <span
          {...attributes}
          {...{ [PAGE_SPACER_ATTR]: 'true' }}
          className="pv-page-spacer"
          style={{ height: `${element.height ?? 0}px` }}
        >
          {children}
        </span>
      );
    case "table":
      return <TableElement attributes={attributes} children={children} element={element} />;
    case "table-row":
      return (
        <tr {...attributes}>
          {children}
        </tr>
      );
    case "table-cell":
      return (
        <td {...attributes} style={{ border: '1px solid #555', padding: '8px' }}>
          {children}
        </td>
      );
    case "header":
      return (
        <h1 {...attributes} id={element.id} style={style}>
          {children}
        </h1>
      );
    case "header2":
      return (
        <h2 {...attributes} id={element.id} style={style}>
          {children}
        </h2>
      );
    case "header3":
      return (
        <h3 {...attributes} id={element.id} style={style}>
          {children}
        </h3>
      );
    case "header4":
      return (
        <h4 {...attributes} id={element.id} style={style}>
          {children}
        </h4>
      );
    case "ulist":
      return (
        <ul {...attributes} style={{ ...style, listStylePosition: 'inside' }}>
          {children}
        </ul>
      );
    case "olist":
      return (
        <ol {...attributes} style={{ ...style, listStylePosition: 'inside' }}>
          {children}
        </ol>
      );
    case "list-item":
      return (
        <li {...attributes} style={style}>
          {children}
        </li>
      );
    case "check":
      return (
        <CheckItemElement attributes={attributes} element={element} style={style}>
          {children}
        </CheckItemElement>
      );
    default:
      return (
        <p {...attributes} style={style}>
          {" "}
          {children}
        </p>
      );
  }
};

const Leaf = ({ attributes, children, leaf }: RenderLeafProps) => {
  let styledChildren = children;
  if ((leaf as any).searchHighlight) {
    styledChildren = <span style={{ backgroundColor: (leaf as any).activeHighlight ? 'rgba(255, 140, 0, 0.6)' : 'rgba(255, 215, 0, 0.4)' }}>{styledChildren}</span>;
  }
  if ((leaf as any).spell) {
    styledChildren = (
      <span className="rn-spell-error" data-rn-spell={(leaf as any).spell}>{styledChildren}</span>
    );
  }
  if (leaf.bold) {
    styledChildren = <strong>{styledChildren}</strong>;
  }
  if (leaf.italic) {
    styledChildren = <i>{styledChildren}</i>;
  }
  if (leaf.underline) {
    styledChildren = <u>{styledChildren}</u>;
  }
  if (leaf.quote){
    styledChildren = <q>{styledChildren}</q>
  }
  if (leaf.code){
    styledChildren = <code>{styledChildren}</code>
  }
  if (leaf.highlight){
    styledChildren = <mark>{styledChildren}</mark>
  }
  if (leaf.link && leaf.href){
    const isInternalLink = leaf.href.startsWith('#');
    
    const handleClick = (e: React.MouseEvent) => {
      if (isInternalLink) {
        e.preventDefault();
        const targetId = leaf.href!.substring(1);
        const targetElement = document.getElementById(targetId);
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    };

    styledChildren = (
      <Popup content={isInternalLink ? `Go to: ${leaf.href}` : leaf.href} position="bottom" delay={300}>
        <a 
          href={leaf.href} 
          target={isInternalLink ? undefined : "_blank"} 
          rel={isInternalLink ? undefined : "noopener noreferrer"} 
          onClick={handleClick}
          style={{
            color: '#4dabf7', 
            textDecoration: isInternalLink ? 'none' : 'underline',
            borderBottom: isInternalLink ? '1px dashed #4dabf7' : 'none',
            cursor: 'pointer',
          }}
        >
          {styledChildren}
        </a>
      </Popup>
    )
  }
  const style: React.CSSProperties = {
    ...(leaf.fontSize && { fontSize: `${leaf.fontSize}px` }),
    ...(leaf.color && { color: leaf.color }),
    ...(leaf.crossedOut && {textDecoration: "line-through"}),
    ...(leaf.fontFamily && { fontFamily: leaf.fontFamily }),
  };
  return (
    <span {...attributes} style={style}>
      {styledChildren}
    </span>
  );
};
export const insertImage = (editor: ReactEditor, url: string, size: ImageSize = "original", alignment: "start" | "center" | "end" | "justify" = "center") => {
    const image: CustomElement = {
      type: "image", 
      url,
      size,
      alignment,
      children: [{text: ""}],
    };
    editor.insertNode(image);
  };

interface DocumentMeta {
  view_mode: 'notepad' | 'document';
  header_enabled: boolean;
  footer_enabled: boolean;
  header_text: string;
  footer_text: string;
}

interface TabData {
  id: string;
  name: string;
  value: Descendant[];
  changed: boolean;
  key: number;
  viewMode: ViewMode;
  headerEnabled: boolean;
  footerEnabled: boolean;
  headerText: string;
  footerText: string;
}

const MySlateEditor = () => {
  const { t, i18n: i18nRuntime } = useTranslation();
  const notify = useAlert();
  const [tabs, setTabs] = useState<TabData[]>([
    { id: 'tab-1', name: 'Document', value: initialValue, changed: false, key: 0, viewMode: 'notepad', headerEnabled: false, footerEnabled: false, headerText: '', footerText: '' }
  ]);
  const [activeTabId, setActiveTabId] = useState('tab-1');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const [characterCount, setCharacterCount] = useState(0);
  const [tabCounter, setTabCounter] = useState(1);
  const isInitialMount = useRef(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [spellVersion, setSpellVersion] = useState(0);
  const [spellingReviewOpen, setSpellingReviewOpen] = useState(false);
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const [spellTarget, setSpellTarget] = useState<SpellPayload | null>(null);
  const [spellHover, setSpellHover] = useState<{ payload: SpellPayload; x: number; y: number } | null>(null);
  const spellHoverTimer = useRef<number | undefined>(undefined);
  const spellRuleLabel = useRuleLabel();

  const spellLanguage = settings.spellcheckLanguage || i18nRuntime.language || 'en';
  const [typeSpeed, setTypeSpeed] = useState<number | null>(null);
  const [pageCount, setPageCount] = useState(1);
  const [showFindPanel, setShowFindPanel] = useState(false);
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [editorVersion, setEditorVersion] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [printingOption, setPrintingOption] = useState(false);
  const typingStartTime = useRef<number | null>(null);
  const totalCharsTyped = useRef<number>(0);
  const visualLinesRef = useRef<LineEntry[]>([]);
  const notepadRef = useRef<HTMLDivElement>(null);
  // mark the tab dirty so it can diferentiate that gaps are layout not content.
  const spacerVoidRef = useRef(false);
  // Capping the rewrites per user edit means so the worst case is stale pagination
  const reconcileCapRef = useRef(0);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const editor = useMemo(() => pageWithSpacers(withImages(withHistory(withReact(createEditor())))), [activeTab?.key]);

  useEffect(() => {
    if (!settings.restoreSession) return;
    const tabIds = tabs.map(t => t.id);
    invoke("save_session", { tabIds, activeTabId }).catch(() => {});
  }, [tabs, activeTabId, settings.restoreSession]);

  useEffect(() => {
    (async () => {
      try {
        const loaded = await invoke<any>("get_settings");
        setSettings({
          autoSaveEnabled: loaded.auto_save_enabled,
          autoSaveInterval: loaded.auto_save_interval,
          showUnsavedWarning: loaded.show_unsaved_warning,
          showTypeSpeed: loaded.show_type_speed,
          pageSize: loaded.page_size || 'letter',
          restoreSession: loaded.restore_session ?? false,
          markdownEnabled: loaded.markdown_enabled ?? false,
          language: loaded.language ?? '',
          spellcheckEnabled: loaded.spellcheck_enabled ?? true,
          spellcheckLanguage: loaded.spellcheck_language ?? '',
        });
        	activatePreferredUserLanguage(loaded.language);

        let counter = 1;
        const allTabs: TabData[] = [];
        let activeRestoredId = '';

        if (loaded.restore_session) {
          try {
            const session = await invoke<{ paths: string[]; active_path: string }>("get_session");
            if (session.paths && session.paths.length > 0) {
              for (const filePath of session.paths) {
                const tabId = `tab-${counter}`;
                counter++;
                try {
                  await invoke("create_tab", { tabId });
                  const [loadedDocument, loadedName, meta] = await invoke<Data>("open_file_by_path", { tabId, filePath });
                  const newTab: TabData = {
                    id: tabId,
                    name: loadedName,
                    value: loadedDocument,
                    changed: false,
                    key: Date.now() + counter,
                    viewMode: meta.view_mode === 'document' ? 'document' : 'notepad',
                    headerEnabled: meta.header_enabled,
                    footerEnabled: meta.footer_enabled,
                    headerText: meta.header_text,
                    footerText: meta.footer_text,
                  };
                  allTabs.push(newTab);
                  if (filePath === session.active_path) activeRestoredId = tabId;
                } catch {
                  await invoke("remove_tab", { tabId }).catch(() => {});
                }
              }
            }
          } catch {}
        }

        try {
          const startupFile = await invoke<string | null>("get_startup_file");
          if (startupFile) {
            const tabId = `tab-${counter}`;
            counter++;
            try {
              await invoke("create_tab", { tabId });
              const [loadedDocument, loadedName, meta] = await invoke<Data>("open_file_by_path", { tabId, filePath: startupFile });
              const newTab: TabData = {
                id: tabId,
                name: loadedName,
                value: loadedDocument,
                changed: false,
                key: Date.now() + counter,
                viewMode: meta.view_mode === 'document' ? 'document' : 'notepad',
                headerEnabled: meta.header_enabled,
                footerEnabled: meta.footer_enabled,
                headerText: meta.header_text,
                footerText: meta.footer_text,
              };
              allTabs.push(newTab);
              activeRestoredId = tabId;
            } catch {
              await invoke("remove_tab", { tabId }).catch(() => {});
            }
          }
        } catch {}

        if (allTabs.length > 0) {
          setTabCounter(counter - 1);
          setTabs(allTabs);
          setActiveTabId(activeRestoredId || allTabs[allTabs.length - 1].id);
        }
      } catch {}
    })();
  }, []);

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

      if (e.ctrlKey){
        switch (e.key){
          case 's':
          save();
          break;
          case 'o':
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
      else if (e.ctrlKey && e.altKey && e.ctrlKey === 's'){
        saveAs();
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

  useEffect(() => {
    invoke("editor_changed", { hasChanged: activeTab.changed, tabId: activeTabId });
  }, [activeTab.changed, activeTabId]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    // It change the document but not the content.
    if (spacerVoidRef.current) {
      spacerVoidRef.current = false;
      return;
    }
    reconcileCapRef.current = 0;
    updateTab({ changed: true });
  }, [activeTab.value]);

  useEffect(() => {
    if (!settings.autoSaveEnabled) return;
    const intervalMs = settings.autoSaveInterval * 60 * 1000;
    const timer = setInterval(async () => {
      if (!activeTab.changed) return;
      try {
        const isSaved = await invoke<boolean>("is_tab_saved_to_disk", { tabId: activeTabId });
        if (isSaved) {
          await invoke("save_tab", { document: stripPageSpacers(activeTab.value), documentName: activeTab.name, tabId: activeTabId, meta: buildMeta() });
          updateTab({ changed: false });
        }
      } catch (err) {
        console.error("Auto-save failed:", err);
      }
    }, intervalMs);
    return () => clearInterval(timer);
  }, [settings.autoSaveEnabled, settings.autoSaveInterval, activeTab.changed, activeTab.value, activeTab.name, activeTabId]);

  useEffect(() => {
    if (!settings.showTypeSpeed) {
      setTypeSpeed(null);
      typingStartTime.current = null;
      totalCharsTyped.current = 0;
      return;
    }
    const interval = setInterval(() => {
      if (typingStartTime.current === null || totalCharsTyped.current === 0) {
        setTypeSpeed(0);
        return;
      }
      const elapsedMinutes = (Date.now() - typingStartTime.current) / 60000;
      if (elapsedMinutes < 0.05) {
        setTypeSpeed(0);
        return;
      }
      const wpm = Math.round((totalCharsTyped.current / 5) / elapsedMinutes);
      setTypeSpeed(wpm);
    }, 2000);
    return () => clearInterval(interval);
  }, [settings.showTypeSpeed]);

  const trackKeystroke = useCallback(() => {
    if (settings.showTypeSpeed) {
      if (typingStartTime.current === null) {
        typingStartTime.current = Date.now();
      }
      totalCharsTyped.current += 1;
    }
  }, [settings.showTypeSpeed]);


  const handlePaste = useCallback(async (event: React.ClipboardEvent) => {
    const clipboardData = event.clipboardData;
    

    if (clipboardData.files && clipboardData.files.length > 0) {
      const file = clipboardData.files[0];
      if (file.type.startsWith('image/')) {
        event.preventDefault();
        try {
          const filePath = await invoke<string>("insert_image_from_clipboard");
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
          const filePath = await invoke<string>("insert_image_from_clipboard");
          insertImage(editor, filePath);
        } catch (error) {
          console.error("Error pasting image:", error);
        }
        return;
      }
    }
  }, [editor]);

  
  const renderElement = useCallback(
    (props: RenderElementProps) => <Element {...props} />,
    []
  );
  const renderLeaf = useCallback(
    (props: RenderLeafProps) => <Leaf {...props} />,
    []
  );

  const handleMatchesChange = useCallback((matches: SearchMatch[], currentIndex: number) => {
    setSearchMatches(matches)
    setCurrentMatchIndex(currentIndex)
  }, [])

  const decorate = useCallback(([node, path]: NodeEntry): SlateRange[] => {
    const ranges: SlateRange[] = []
    if (!Text.isText(node) || searchMatches.length === 0) return ranges

    for (let i = 0; i < searchMatches.length; i++) {
      const match = searchMatches[i]
      if (match.path.length === path.length && match.path.every((v, idx) => v === path[idx])) {
        ranges.push({
          anchor: { path, offset: match.offset },
          focus: { path, offset: match.offset + match.length },
          searchHighlight: true,
          activeHighlight: i === currentMatchIndex,
        } as any)
      }
    }

    return ranges
  }, [searchMatches, currentMatchIndex])

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
    return extractSpellRangesFromNode(blockEntry[0], blockEntry[1], path, node.text.length)
  }, [editor, spellVersion, settings.spellcheckEnabled])

  const decorateAll = useCallback((entry: NodeEntry): SlateRange[] => {
    return [...decorate(entry), ...decorateSpelling(entry)]
  }, [decorate, decorateSpelling])

  const runSpellcheck = useCallback(async () => {
    if (!settingsRef.current.spellcheckEnabled) return
    const changed = await updateSpellingChecks(editor, spellLanguage)
    if (changed) setSpellVersion((version) => version + 1)
  }, [editor, spellLanguage])

  useEffect(() => {
    if (!settings.spellcheckEnabled) return
    const timer = window.setTimeout(() => { void runSpellcheck() }, 400)
    return () => window.clearTimeout(timer)
  }, [runSpellcheck, editorVersion, activeTabId, settings.spellcheckEnabled])

  useEffect(() => {
    invalidateSpellCheckCache(editor)
    setSpellVersion((version) => version + 1)
  }, [editor, spellLanguage])

 /** Underlines appearing or leaving re-split blocks into leaves, replacing the DOM node with the caret and causing the browser to drop it to the block start while editor.
  * selection stays correct until the next keystroke where damage becomes visible. 
  * The repair is deferred rather than done in the layout phase because measured when 
  * layout effects run both the DOM and Slate agree and Slate's own selection sync moves it afterwards, 
  * so a later task is the first point where damage is visible. 
  * */


  useLayoutEffect(() => {
    const repair = () => {
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
    }

    const id = window.setTimeout(repair, 0)
    return () => window.clearTimeout(id)
  }, [editor, spellVersion])

  const recheckDocument = useCallback(() => {
    invalidateSpellCheckCache(editor)
    void runSpellcheck()
  }, [editor, runSpellcheck])

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
  }, [editor, handleKeyDown, trackKeystroke]);

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

  const editableProps: EditableSurfaceProps = useMemo(() => ({
    renderElement,
    renderLeaf,
    decorate: decorateAll,
    onKeyDown: handleEditKeyDownEvent,
    onPaste: handlePaste,
    onDOMBeforeInput: handleDOMBeforeInput,
    placeholder: t("Start Writing something..."),
  }), [renderElement, renderLeaf, decorateAll, handleEditKeyDownEvent, handlePaste, handleDOMBeforeInput]);

  type Data = [Descendant[], string, DocumentMeta];

  const getDocumentName = (name: string) => {
    updateTab({ name });
  };

  const handleCommitDocumentName = async (name: string) => {
    const savedToDisk = await invoke<boolean>("is_tab_saved_to_disk", { tabId: activeTabId }).catch(() => false);
    if (savedToDisk && name.trim()) {
      invoke("rename_tab_file", { tabId: activeTabId, newName: name.trim() }).catch(() => {});
    }
  };

  const updateTab = (updates: Partial<TabData>) => {
    setTabs(prev => prev.map(tab => 
      tab.id === activeTabId ? { ...tab, ...updates } : tab
    ));
  };

  const handleTabClick = (tabId: string) => {
    isInitialMount.current = true;
    typingStartTime.current = null;
    totalCharsTyped.current = 0;
    setTypeSpeed(settings.showTypeSpeed ? 0 : null);
    setActiveTabId(tabId);
  };

  const handleTabClose = async (tabId: string) => {
    const tabToClose = tabs.find(t => t.id === tabId);
    if (!tabToClose) return;

    if (tabToClose.changed && settings.showUnsavedWarning) {
      const confirmed = await invoke<boolean>("confirm_close_tab", { tabId });
      if (!confirmed) return;
    }

    await invoke("remove_tab", { tabId });

    if (tabs.length === 1) {
      const newTabId = `tab-${tabCounter + 1}`;
      setTabCounter(prev => prev + 1);
      await invoke("create_tab", { tabId: newTabId });
      setTabs([{ id: newTabId, name: 'Document', value: initialValue, changed: false, key: 0, viewMode: 'notepad', headerEnabled: false, footerEnabled: false, headerText: '', footerText: '' }]);
      setActiveTabId(newTabId);
      isInitialMount.current = true;
    } else {
      const newTabs = tabs.filter(t => t.id !== tabId);
      setTabs(newTabs);
      if (activeTabId === tabId) {
        isInitialMount.current = true;
        setActiveTabId(newTabs[newTabs.length - 1].id);
      }
    }
  };

  const handleNewTab = async () => {
    const newTabId = `tab-${tabCounter + 1}`;
    setTabCounter(prev => prev + 1);
    await invoke("create_tab", { tabId: newTabId });
    const newTab: TabData = {
      id: newTabId,
      name: 'Document',
      value: initialValue,
      changed: true,
      key: Date.now(),
      viewMode: 'notepad',
      headerEnabled: false,
      footerEnabled: false,
      headerText: '',
      footerText: '',
    };
    setTabs(prev => [...prev, newTab]);
    isInitialMount.current = true;
    setActiveTabId(newTabId);

    await invoke("editor_changed", { hasChanged: true, tabId: newTabId });
  };

  const buildMeta = (): DocumentMeta => ({
    view_mode: activeTab.viewMode,
    header_enabled: activeTab.headerEnabled,
    footer_enabled: activeTab.footerEnabled,
    header_text: activeTab.headerText,
    footer_text: activeTab.footerText,
  });

  async function save() {
    const result = await invoke<string>("save_tab", { document: stripPageSpacers(activeTab.value), documentName: activeTab.name, tabId: activeTabId, meta: buildMeta() });
    if (result === "The operation was cancelled") return;
    notify(result, t("Saved"));
    updateTab({ changed: false });
  }

  async function saveAs() {
    const saveResult = await invoke<string>("save_tab_as", { document: stripPageSpacers(activeTab.value), documentName: activeTab.name, tabId: activeTabId, meta: buildMeta() });
    if (saveResult === "__PDF_REQUESTED__") {
      await exportPdf();
      return;
    }
    if (saveResult === "The operation was cancelled") return;
    notify(saveResult, t("Saved"));
    updateTab({ changed: false });
  }

  async function preparePrintCSS(): Promise<{
    cleanup: () => void;
    restoreView: () => void;
    pdfParams: {
      pageWidth: number; pageHeight: number;
      marginTop: number; marginBottom: number;
      marginLeft: number; marginRight: number;
    };
  }> {
    const wasNotepad = activeTab.viewMode !== 'document';
    if (wasNotepad) {
      updateTab({ viewMode: 'document' });
    }

    setPrintingOption(true);
    if (clearPageSpacers(editor)) spacerVoidRef.current = true;

    await new Promise<void>(r =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => r())
        )
      )
    );

    const pm = getPageModel(settings.pageSize);
    const toPt = (px: number) => Math.round(px * 72 / 96);

    document.getElementById('rnotes-print-page-size')?.remove();
    const styleEl = document.createElement('style');
    styleEl.id = 'rnotes-print-page-size';
    styleEl.textContent =
      `@page { size: ${getCssPageSize(settings.pageSize)}; ` +
      `margin: ${toPt(pm.marginTop)}pt ${toPt(pm.marginRight)}pt ${toPt(pm.marginBottom)}pt ${toPt(pm.marginLeft)}pt; }\n` +
      `@media print { .pv-editor-surface [data-slate-editor="true"] { orphans: 2; widows: 2; } }\n`;
    document.head.appendChild(styleEl);

    const toInches = (px: number) => px / 96;

    return {
      cleanup: () => document.getElementById('rnotes-print-page-size')?.remove(),
      restoreView: () => {
        setPrintingOption(false);
        if (wasNotepad) updateTab({ viewMode: 'notepad' });
      },
      pdfParams: {
        pageWidth: toInches(pm.widthPx),
        pageHeight: toInches(pm.heightPx),
        marginTop: toInches(pm.marginTop),
        marginBottom: toInches(pm.marginBottom),
        marginLeft: toInches(pm.marginLeft),
        marginRight: toInches(pm.marginRight),
      },
    };
  }

  async function print() {
    try {
      
      const result = await invoke<string>("save_tab", {
        document: stripPageSpacers(activeTab.value),
        documentName: activeTab.name,
        tabId: activeTabId,
        meta: buildMeta(),
      });
      if (result === "The operation was cancelled") return;
      updateTab({ changed: false });

      
      const { cleanup, restoreView, pdfParams } = await preparePrintCSS();

      try {
        
        await invoke("print_pdf", pdfParams);
      } finally {
        cleanup();
        restoreView();
      }
    } catch (error) {
      if (String(error) !== "The operation was cancelled") {
        console.error("Error printing:", error);
      }
    }
  }

  async function exportPdf() {
    try {
      const { cleanup, restoreView, pdfParams } = await preparePrintCSS();

      try {
        const msg = await invoke<string>("export_to_pdf", { ...pdfParams, documentName: activeTab.name });
        notify(msg, t("Exported"));
      } finally {
        cleanup();
        restoreView();
      }
    } catch (error) {
      if (String(error) !== "The operation was cancelled") {
        console.error("Error exporting PDF:", error);
      }
    }
  }

  async function exportToFile(format: string) {
    try {
      const msg = await invoke<string>("export_to_file", {
        document: stripPageSpacers(activeTab.value),
        documentName: activeTab.name,
        format,
        meta: buildMeta(),
      });
      if (msg !== "The operation was cancelled") notify(msg, t("Exported"));
    } catch (error) {
      if (String(error) !== "The operation was cancelled") {
        console.error("Error exporting:", error);
      }
    }
  }

  async function open() {
    try {
      const [loadedDocument, loadedName, meta] = await invoke<Data>("open_in_tab", { tabId: activeTabId });
      isInitialMount.current = true;
      updateTab({ 
        value: loadedDocument, 
        name: loadedName, 
        changed: false,
        key: Date.now(),
        viewMode: meta.view_mode === 'document' ? 'document' : 'notepad',
        headerEnabled: meta.header_enabled,
        footerEnabled: meta.footer_enabled,
        headerText: meta.header_text,
        footerText: meta.footer_text,
      });
    } catch (error) {
      if (error !== "The operation was cancelled") {
        notify(String(error), t("Could not open file"));
      }
    }
  }

  async function newDocument() {
    await handleNewTab();
  }

  const tabBarTabs: Tab[] = tabs.map(t => ({
    id: t.id,
    name: t.name,
    isModified: t.changed
  }));

  const submenuItemStyle: React.CSSProperties = {
    padding: '8px 16px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontSize: '13px',
  };

  const makeFormatSubmenu = (handler: (format: string) => void) => (
    <div style={{ minWidth: '140px' }}>
      {[
        { id: 'rdocx', label: 'RDOCX' },
        { id: 'json', label: 'JSON' },
        { id: 'md', label: 'MD' },
        { id: 'txt', label: 'TXT' },
        { id: 'pdf', label: 'PDF' },
      ].map((f) => (
        <div
          key={f.id}
          style={submenuItemStyle}
          onMouseDown={(e) => { e.preventDefault(); handler(f.id); }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#333'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
        >
          {f.label}
        </div>
      ))}
    </div>
  );

  const handleExportFormat = (format: string) => {
    if (format === 'pdf') {
      exportPdf();
    } else {
      exportToFile(format);
    }
  };

  const fileMenuItems: ActionDropdownItem[] = [
    { id: 'new', label: t("New"), tooltip: t("Create a new document"), shortcut: 'Ctrl+N' },
    { id: 'open', label: t("Open"), tooltip: t("Open an existing document"), shortcut: 'Ctrl+O', divider: true },
    { id: 'save', label: t("Save"), tooltip: t("Save the current document"), shortcut: 'Ctrl+S' },
    { id: 'saveAs', label: t("Save As"), tooltip: t("Save the document as a new file"), shortcut: 'Ctrl+Alt+S', divider: true },
    { id: 'export', label: t("Export"), submenu: makeFormatSubmenu(handleExportFormat), divider: true },
    { id: 'print', label: t("Print"), tooltip: t("Print the document"), shortcut: 'Ctrl+P', divider: true },
    { id: 'settings', label: t("Settings"), tooltip: t("Open application settings") },
  ];

  const handleFileAction = (actionId: string) => {
    switch (actionId) {
      case 'new':
        newDocument();
        break;
      case 'open':
        open();
        break;
      case 'save':
        save();
        break;
      case 'saveAs':
        saveAs();
        break;
      case 'print':
        print();
        break;
      case 'settings':
        setSettingsOpen(true);
        break;
    }
  };

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

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setSpellTarget(readPayloadAt(e.target));
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const keepSpellHover = () => window.clearTimeout(spellHoverTimer.current);

  /** Time the pointers need to reach the word*/
  const releaseSpellHover = () => {
    window.clearTimeout(spellHoverTimer.current);
    spellHoverTimer.current = window.setTimeout(() => setSpellHover(null), 250);
  };

  const handleEditorMouseOver = (e: React.MouseEvent) => {
    const payload = readPayloadAt(e.target);
    if (!payload) {
      releaseSpellHover();
      return;
    }
    keepSpellHover();
    const element = (e.target as HTMLElement).closest('[data-rn-spell]') as HTMLElement;
    const rect = element.getBoundingClientRect();
    setSpellHover({ payload, x: rect.left + rect.width / 2, y: rect.bottom + 6 });
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

  const handleSpellCorrect = () => {
    handleCloseContextMenu();
    if (!spellTarget) return;
    const replacement = spellTarget.suggestions[0];
    if (replacement === undefined) return;

    applyWordSuggestion(spellTarget, replacement);
  };

  const handleSpellAddWord = async () => {
    handleCloseContextMenu();
    if (!spellTarget) return;
    await addToPersonalDictionary(spellTarget.text);
    recheckDocument();
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
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
    ...(spellTarget && spellTarget.suggestions.length > 0
      ? [{
          id: 'spellCorrect',
          label: t("Correct"),
          shortcut: spellTarget.suggestions[0] || undefined,
          onClick: handleSpellCorrect,
          divider: spellTarget.rule !== 'spelling',
        }]
      : []),
    ...(spellTarget?.rule === 'spelling'
      ? [{ id: 'spellAdd', label: t("Add to dictionary"), onClick: handleSpellAddWord, divider: true }]
      : []),
  ];


  return (
    <div>
      <TabBar
        tabs={tabBarTabs}
        activeTabId={activeTabId}
        onTabClick={handleTabClick}
        onTabClose={handleTabClose}
        onNewTab={handleNewTab}
      />
      <div className="miscellaneous-bar">
        <Miscellaneousbar loadDocumentName={getDocumentName} onCommitDocumentName={handleCommitDocumentName} documentName={activeTab.name} editor={editor} editorVersion={editorVersion} onToolSelect={(tool) => tool === 'spelling' ? setSpellingReviewOpen(true) : setDictionaryOpen(true)}>    
          <ActionDropdown
          items={fileMenuItems}
          onSelect={handleFileAction}
          renderButton={(_isOpen, toggle) => (
            <button onMouseDown={(e) => { e.preventDefault(); toggle(); }}>
                {t("File")}</button>
            )}
          />
        </Miscellaneousbar>
      </div>
      <div className="editor-wrapper" onContextMenu={handleContextMenu} onMouseOver={handleEditorMouseOver} onMouseLeave={releaseSpellHover} onWheel={(e) => {
        if (e.ctrlKey) {
          e.preventDefault();
          setZoomLevel(prev => Math.min(200, Math.max(50, prev + (e.deltaY < 0 ? 10 : -10))));
        }
      }}>
        <div className="editor-container" style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center', width: `${10000 / zoomLevel}%` }}>
          <Slate
            key={activeTab.key}
            editor={editor}
            initialValue={activeTab.value}
            onChange={(v) => {
              updateTab({ value: v });
              updateCursorPosition();
              setEditorVersion(prev => prev + 1);
            }}
          >
            <div className="toolbar">
              <Toolbar editor={editor} />
            </div>
            <div style={{ position: 'relative', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <FindReplacePanel
                editor={editor}
                isOpen={showFindPanel}
                onClose={() => {
                  setShowFindPanel(false)
                  setSearchMatches([])
                  setCurrentMatchIndex(-1)
                }}
                onMatchesChange={handleMatchesChange}
              />
              {activeTab.viewMode === 'document' ? (
                <PageView
                  editableProps={editableProps}
                  headerEnabled={activeTab.headerEnabled}
                  footerEnabled={activeTab.footerEnabled}
                  headerText={activeTab.headerText}
                  footerText={activeTab.footerText}
                  onHeaderTextChange={(text) => updateTab({ headerText: text })}
                  onFooterTextChange={(text) => updateTab({ footerText: text })}
                  onPageCountChange={setPageCount}
                  onPaginationChange={handlePaginationChange}
                  pageSize={settings.pageSize}
                  printing={printingOption}
                />
              ) : (
                <div className="editor-content" ref={notepadRef}>
                  <Editable {...editableProps} />
                </div>
              )}
            </div>
          </Slate>
        </div>
      </div>
      <StatusBar
        characterCount={characterCount}
        line={cursorPosition.line}
        column={cursorPosition.column}
        isSaved={!activeTab.changed}
        typeSpeed={typeSpeed}
        showTypeSpeed={settings.showTypeSpeed}
        pageCount={activeTab.viewMode === 'document' ? pageCount : undefined}
        zoomLevel={zoomLevel}
        onZoomReset={() => setZoomLevel(100)}
      />
      <SpellingReview
        isOpen={spellingReviewOpen}
        onClose={() => setSpellingReviewOpen(false)}
        editor={editor}
        language={spellLanguage}
        onCorrected={recheckDocument}
      />

      <DictionarySettings
        isOpen={dictionaryOpen}
        onClose={() => setDictionaryOpen(false)}
        settings={settings}
        onSettingsChange={setSettings}
        onDictionaryChanged={recheckDocument}
      />

      {spellHover && !contextMenu && !spellingReviewOpen && !dictionaryOpen && !settingsOpen && (
        <div
          className="rn-spell-popup"
          style={{ left: spellHover.x, top: spellHover.y }}
          onMouseEnter={keepSpellHover}
          onMouseLeave={releaseSpellHover}
        >
          <span className="rn-spell-suggestions-title">{spellRuleLabel(spellHover.payload.rule)}</span>
          {spellHover.payload.suggestions.length === 0 ? (
            <span className="rn-spell-suggestion-empty">{t("No suggestions")}</span>
          ) : (
            spellHover.payload.suggestions.slice(0, 5).map((suggestion, index) => (
              <button
                type="button"
                className="rn-spell-suggestion"
                key={`${suggestion}-${index}`}
                // mousedown, and prevented, so the click never takes focus off the editor.
                onMouseDown={(event) => {
                  event.preventDefault();
                  applyWordSuggestion(spellHover.payload, suggestion);
                  setSpellHover(null);
                }}
              >
                {suggestion === '' ? t("(remove)") : suggestion}
              </button>
            ))
          )}
        </div>
      )}

      <Settings
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSettingsChange={setSettings}
        onRequestSave={async () => {
          try {
            const isSaved = await invoke<boolean>("is_tab_saved_to_disk", { tabId: activeTabId });
            if (isSaved) return true;
            const saveResult = await invoke<string>("save_tab", { document: stripPageSpacers(activeTab.value), documentName: activeTab.name, tabId: activeTabId, meta: buildMeta() });
            if (saveResult === "The operation was cancelled") return false;
            updateTab({ changed: false });
            return true;
          } catch {
            return false;
          }
        }}
        viewMode={activeTab.viewMode}
        onViewModeChange={(mode) => updateTab({ viewMode: mode })}
        headerEnabled={activeTab.headerEnabled}
        footerEnabled={activeTab.footerEnabled}
        onHeaderEnabledChange={(enabled) => updateTab({ headerEnabled: enabled })}
        onFooterEnabledChange={(enabled) => updateTab({ footerEnabled: enabled })}
      />
      {contextMenu && (
        <div className="context-menu">
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenuItems}
            onClose={handleCloseContextMenu}
          />
        </div>
      )}
    </div>
  );
};




export default MySlateEditor;
