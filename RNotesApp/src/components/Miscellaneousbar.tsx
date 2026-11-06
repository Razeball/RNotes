import { useTranslation } from 'react-i18next';
import { BaseEditor, Editor, Range } from 'slate'
import { ReactEditor } from 'slate-react'
import { HistoryEditor } from 'slate-history'
import { Transforms, Text } from 'slate'
import { useEffect, useState, useMemo, useRef } from 'react'
import { invoke } from "@tauri-apps/api/core";
import { insertImage } from '../editorActions'
import { insertTable } from './Table'
import Modal from './Modal'
import ActionDropdown, { ActionDropdownItem } from './ActionDropdown'
import { useAlert } from './Notice'

export type MiscellaneousbarProps = {
    children?: React.ReactNode
    loadDocumentName: (name: string) => void
    onCommitDocumentName?: (name: string) => void
    documentName: string
    editor: BaseEditor & ReactEditor & HistoryEditor
    /** The tab being edited: an inserted image is copied next to that tab's document. */
    tabId: string
    editorVersion?: number
    onToolSelect?: (tool: 'spelling' | 'dictionary') => void
}
/**
 * Format shortcuts by *physical* key (`KeyboardEvent.code`), which is what the labels describe.
 * Matching the produced character instead ties them to one layout: the old handler listened for
 * "$", "%" and "^", which is Shift+4/5/6 on a US keyboard — on a Spanish one Shift+6 is "&", so
 * the link shortcut never fired.
 */
const FORMAT_SHORTCUTS: Record<string, 'quote' | 'code' | 'crossedOut' | 'highlight' | 'link'> = {
  KeyQ: 'quote',
  Digit4: 'code',
  Digit5: 'crossedOut',
  KeyH: 'highlight',
  Digit6: 'link',
}

export default function Miscellaneousbar({children, loadDocumentName, onCommitDocumentName, documentName, editor, tabId, editorVersion, onToolSelect} : MiscellaneousbarProps) {
  const { t } = useTranslation();
  
  const formatOptions: { value: 'quote' | 'code' | 'crossedOut' | 'highlight' | 'link', label: string, shortcut: string, tooltip: string }[] = [
    { value: 'quote', label: t("Quote"), shortcut: 'Alt+Shift+Q', tooltip: t("Apply quote formatting") },
    { value: 'code', label: t("Code"), shortcut: 'Alt+Shift+4', tooltip: t("Apply code formatting") },
    { value: 'crossedOut', label: t("Crossed Out"), shortcut: 'Alt+Shift+5', tooltip: t("Apply strikethrough formatting") },
    { value: 'highlight', label: t("Highlight"), shortcut: 'Alt+Shift+H', tooltip: t("Apply highlight formatting") },
    { value: 'link', label: t("Link"), shortcut: 'Alt+Shift+6', tooltip: t("Apply link formatting") }
  ];

  const notify = useAlert();

  const [showLinkPopup, setShowLinkPopup] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [hasSelection, setHasSelection] = useState(false);
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());

  const selectionKey = useMemo(() => {
    const sel = editor.selection;
    if (!sel) return 'null';
    return `${sel.anchor.path.join(',')}-${sel.anchor.offset}-${sel.focus.path.join(',')}-${sel.focus.offset}`;
  }, [editor.selection]);

  const currentMarks = Editor.marks(editor)
  const marksKey = currentMarks ? JSON.stringify(currentMarks) : 'null'

  useEffect(() => {
    const { selection } = editor;
    if (!selection) {
      setActiveFormats(new Set());
      return;
    }
    const nodes = Array.from(Editor.nodes(editor, {
      at: selection,
      match: (n: any) => Text.isText(n),
    }));
    if (nodes.length === 0) {
      setActiveFormats(new Set());
      return;
    }
    const formats: string[] = ['highlight', 'quote', 'code', 'crossedOut'];
    const active = new Set<string>();
    for (const fmt of formats) {
      if (nodes.every(([node]: any) => node[fmt] === true)) {
        active.add(fmt);
      }
    }
    setActiveFormats(active);
  }, [editor, selectionKey, marksKey, editorVersion]);
  

  const handleFormatSelect = (format: 'quote' | 'code' | 'crossedOut' | 'highlight' | 'link') => {
    if (format === 'link') {

      const [match] = Editor.nodes(editor, {
        match: (n: any) => Text.isText(n) && n.link === true,
        universal: true
      });
      
      if (match) {

        Transforms.setNodes(
          editor,
          { link: undefined, href: undefined },
          { match: (n: any) => Text.isText(n) && n.link === true, split: true }
        );
        ReactEditor.focus(editor);
        return;
      }
      

      const { selection } = editor;
      const hasText = selection && !Range.isCollapsed(selection);
      setHasSelection(!!hasText);
      setLinkUrl('');
      setLinkText('');
      setShowLinkPopup(true);
      return;
    }
    
    const [match] = Editor.nodes(editor, {
      match: (n: any) => n[format] === true,
      universal: true
    })
    Transforms.setNodes(
      editor,
      { [format]: match ? undefined : true },
      { match: (n: any) => Text.isText(n), split: true }
    )
    ReactEditor.focus(editor)
  }

  // The window listener is registered once, so it reaches the handler through a ref that every render
  // updates. It used to close over the first render's handler directly — and with it the editor of
  // whichever tab was open then, so after a tab switch the shortcuts formatted a tab not on screen.
  const formatShortcutRef = useRef(handleFormatSelect)
  formatShortcutRef.current = handleFormatSelect

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl excluded: AltGr arrives as Ctrl+Alt on Windows, and AltGr+Shift types characters.
      if (!e.altKey || !e.shiftKey || e.ctrlKey) return
      const format = FORMAT_SHORTCUTS[e.code]
      if (!format) return
      e.preventDefault()
      formatShortcutRef.current(format)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const applyLink = () => {
    if (!linkUrl) {
      notify(t("Enter a URL for the link."), t("Insert Link"));
      return;
    }

    if (hasSelection) {
      const { selection } = editor;
      if (selection) {
        Transforms.setNodes(
          editor,
          { link: true, href: linkUrl },
          { at: selection, match: (n: any) => Text.isText(n), split: true }
        );
        
        Transforms.collapse(editor, { edge: 'end' });
        
        Editor.removeMark(editor, 'link');
        Editor.removeMark(editor, 'href');
        
        editor.insertText(' ');
      }
    } else {
      if (!linkText) {
        notify(t("Enter the text the link should show."), t("Insert Link"));
        return;
      }
      
      const { selection } = editor;
      if (selection) {
        const insertPoint = selection.anchor;
        editor.insertText(linkText);
        
        const start = { path: insertPoint.path, offset: insertPoint.offset };
        const end = { path: insertPoint.path, offset: insertPoint.offset + linkText.length };
        
        Transforms.setNodes(
          editor,
          { link: true, href: linkUrl },
          { at: { anchor: start, focus: end }, match: (n: any) => Text.isText(n), split: true }
        );
        
        Editor.removeMark(editor, 'link');
        Editor.removeMark(editor, 'href');
        
        Transforms.select(editor, {
          anchor: { path: insertPoint.path, offset: insertPoint.offset + linkText.length },
          focus: { path: insertPoint.path, offset: insertPoint.offset + linkText.length }
        });
        
        editor.insertText(' ');
      }
    }

    setShowLinkPopup(false);
    setLinkUrl('');
    setLinkText('');
    ReactEditor.focus(editor);
  };

  const handleInsertImage = async () => {
    try {
      const filePath = await invoke<string | null>("insert_image_from_file", { tabId });
      if (!filePath) return; // the dialog was cancelled
      insertImage(editor, filePath);
      ReactEditor.focus(editor);
    } catch (error) {
      notify(String(error), t("Could not insert image"));
    }
  }

 
  const TableSizeSelector = ({ onSelect }: { onSelect: (rows: number, cols: number) => void }) => {
  const { t } = useTranslation();
    const [hoveredSize, setHoveredSize] = useState({ rows: 0, cols: 0 });
    const maxSize = 10;

    return (
      <div style={{ padding: '8px' }}>
        <div style={{ marginBottom: '8px', textAlign: 'center', fontSize: '12px' }}>
          {hoveredSize.rows > 0 ? `${hoveredSize.rows} x ${hoveredSize.cols}` : t("Select size")}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${maxSize}, 16px)`, gap: '2px' }}>
          {Array.from({ length: maxSize * maxSize }).map((_, index) => {
            const row = Math.floor(index / maxSize) + 1;
            const col = (index % maxSize) + 1;
            const isHighlighted = row <= hoveredSize.rows && col <= hoveredSize.cols;
            
            return (
              <div
                key={index}
                onMouseEnter={() => setHoveredSize({ rows: row, cols: col })}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(row, col);
                }}
                style={{
                  width: '14px',
                  height: '14px',
                  border: '1px solid var(--rn-line-strong)',
                  backgroundColor: isHighlighted ? 'var(--rn-accent)' : 'var(--rn-bg-overlay)',
                  cursor: 'pointer',
                  borderRadius: '2px',
                }}
              />
            );
          })}
        </div>
      </div>
    );
  };

  const handleInsertTable = (rows: number, cols: number) => {
    insertTable(editor, rows, cols);
    ReactEditor.focus(editor);
  };

  const insertMenuItems: ActionDropdownItem[] = [
    { id: 'image', label: t("Image"), tooltip: t("Insert an image from file"), divider: true },
    { 
      id: 'table', 
      label: t("Table"), 
      submenu: <TableSizeSelector onSelect={handleInsertTable} />
    },
  ];

  const formatMenuItems: ActionDropdownItem[] = formatOptions.map((opt) => ({
    id: opt.value,
    label: activeFormats.has(opt.value) ? `✓ ${opt.label}` : opt.label,
    shortcut: opt.shortcut,
    tooltip: opt.tooltip,
  }));

  const handleInsertAction = (actionId: string) => {
    switch (actionId) {
      case 'image':
        handleInsertImage();
        break;
      case 'table':
        handleInsertTable(2, 2);
        break;
    }
  };

  const toolMenuItems: ActionDropdownItem[] = [
    {
      id: 'spelling',
      label: t("Check spelling and grammar"),
      tooltip: t("Check for all spelling and grammar errors and correct them"),
      divider: true,
    },
    {
      id: 'dictionary',
      label: t("Dictionary"),
      tooltip: t("Dictionary settings"),
    },
  ];

  const handleToolAction = (actionId: string) => {
    onToolSelect?.(actionId as 'spelling' | 'dictionary');
  };

  const handleFormatAction = (actionId: string) => {
    handleFormatSelect(actionId as 'quote' | 'code' | 'crossedOut' | 'highlight' | 'link');
  };

  return (
    <div className="miscellaneousbar">
      <div className="misc-image">
        <img src="Document.svg" alt="" style={{width: "64px", height:"64px"}}/>
      </div>
      <div className="document-name">
        <input type="text" value={documentName} placeholder={"Untitled"} onChange={(e) => {
            loadDocumentName(e.target.value)
        }} onBlur={(e) => {
            onCommitDocumentName?.(e.target.value);
        }} onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
        }}/>
      </div>
      <div style={{display: "flex", background: "var(--rn-bg-raised)", padding: "4px", borderRadius: "8px", gap: "4px", marginTop: "8px"}}>
        {children}
        <ActionDropdown
          items={insertMenuItems}
          onSelect={handleInsertAction}
          renderButton={(_isOpen, toggle) => (
            <button onMouseDown={(e) => { e.preventDefault(); toggle(); }}>
              {t("Insert")}</button>
          )}
        />
        <ActionDropdown
          items={formatMenuItems}
          onSelect={handleFormatAction}
          renderButton={(_isOpen, toggle) => (
            <button onMouseDown={(e) => { e.preventDefault(); toggle(); }}>
              {t("Format")}</button>
          )}
        />
        <ActionDropdown
          items={toolMenuItems}
          onSelect={handleToolAction}
          renderButton={(_isOpen, toggle) => (
            <button onMouseDown={(e) => { e.preventDefault(); toggle(); }}>
              {t("Tools")}</button>
          )}
        />
      </div>
      <Modal
        isOpen={showLinkPopup}
        onClose={() => {
          setShowLinkPopup(false);
          setLinkUrl('');
          setLinkText('');
        }}
        title={t("Insert Link")}
      >
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>{t('URL:')}</label>
          <input
            type="text"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://example.com"
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: 'var(--rn-bg-sunken)',
              border: '1px solid var(--rn-line)',
              borderRadius: '4px',
              color: 'var(--rn-text)',
              fontSize: '14px',
            }}
            autoFocus
          />
        </div>
        {!hasSelection && (
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>{t("Link Text:")}</label>
            <input
              type="text"
              value={linkText}
              onChange={(e) => setLinkText(e.target.value)}
              placeholder={t("Enter link text")}
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: 'var(--rn-bg-sunken)',
                border: '1px solid var(--rn-line)',
                borderRadius: '4px',
                color: 'var(--rn-text)',
                fontSize: '14px',
              }}
            />
          </div>
        )}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              setShowLinkPopup(false);
              setLinkUrl('');
              setLinkText('');
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: 'var(--rn-bg-active)',
              border: 'none',
              borderRadius: '4px',
              color: 'var(--rn-text)',
              cursor: 'pointer',
            }}
          >
            {t("Cancel")}</button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              applyLink();
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: 'var(--rn-accent)',
              border: 'none',
              borderRadius: '4px',
              color: 'var(--rn-on-accent)',
              cursor: 'pointer',
            }}
          >
            {t("Apply")}</button>
        </div>
      </Modal>
    </div>
  );
}
