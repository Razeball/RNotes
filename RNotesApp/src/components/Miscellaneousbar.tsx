import { BaseEditor, Editor, Range } from 'slate'
import { ReactEditor } from 'slate-react'
import { HistoryEditor } from 'slate-history'
import { Transforms, Text } from 'slate'
import { useEffect, useState } from 'react'
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { insertImage} from '../Editor'
import { insertTable } from './Table'
import Popup from './Popup'
import Modal from './Modal'

export type MiscellaneousbarProps = {
    children?: React.ReactNode
    loadDocumentName: (name: string) => void
    documentName: string
    editor: BaseEditor & ReactEditor & HistoryEditor
}
export default function Miscellaneousbar({children, loadDocumentName, documentName, editor} : MiscellaneousbarProps) {
  
  const formatOptions: { value: 'quote' | 'code' | 'crossedOut' | 'highlight' | 'link', label: string, shortcut: string }[] = [
    { value: 'quote', label: 'Quote', shortcut: 'Alt+Shift+Q' },
    { value: 'code', label: 'Code', shortcut: 'Alt+Shift+4' },
    { value: 'crossedOut', label: 'Crossed Out', shortcut: 'Alt+Shift+5' },
    { value: 'highlight', label: 'Highlight', shortcut: 'Alt+Shift+H' },
    {value: 'link', label: 'Link', shortcut: 'Alt+Shift+6'}
  ];

  const [showFormatDropdown, setShowFormatDropdown] = useState(false);
  const [showLinkPopup, setShowLinkPopup] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [hasSelection, setHasSelection] = useState(false);
  
   useEffect(() => {
          const handleKeyDown = (e: KeyboardEvent) => {
              if (e.altKey && e.shiftKey) {
                  switch (e.key) {
                      case 'Q':
                          handleFormatSelect('quote')
                          break;
                      case '$':
                          handleFormatSelect('code')
                          break;
                      case '%':
                          handleFormatSelect('crossedOut')
                          break;
                      case 'H':
                        handleFormatSelect('highlight')
                        break;
                      case '^':
                        handleFormatSelect('link')
                        break;
                      default:
                          break;
                  }
              }
          };
  
          window.addEventListener("keydown", handleKeyDown);
          return () => window.removeEventListener("keydown", handleKeyDown);
      }, []);

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
      setShowFormatDropdown(false);
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

  const applyLink = () => {
    if (!linkUrl) {
      alert('Please enter a URL');
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
        alert('Please enter link text');
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
      const filePath = await invoke<string>("insert_image_from_file");
      const url = convertFileSrc(filePath);
      insertImage(editor, url);
      ReactEditor.focus(editor);
    } catch (error) {
      if (error !== "Operation cancelled") {
        alert(`Error inserting image: ${error}`);
      }
    }
  }

 
  const TableSizeSelector = ({ onSelect }: { onSelect: (rows: number, cols: number) => void }) => {
    const [hoveredSize, setHoveredSize] = useState({ rows: 0, cols: 0 });
    const maxSize = 10;

    return (
      <div style={{ padding: '8px' }}>
        <div style={{ marginBottom: '8px', textAlign: 'center', fontSize: '12px' }}>
          {hoveredSize.rows > 0 ? `${hoveredSize.rows} x ${hoveredSize.cols}` : 'Select size'}
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
                  border: '1px solid #666',
                  backgroundColor: isHighlighted ? '#0078d4' : '#333',
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

  const [showTableSelector, setShowTableSelector] = useState(false);

  const handleInsertTable = (rows: number, cols: number) => {
    insertTable(editor, rows, cols);
    setShowTableSelector(false);
    ReactEditor.focus(editor);
  };

  return (
    <div className="miscellaneousbar">
      <div className="misc-image">
        <img src="Document.svg" alt="" style={{width: "64px", height:"64px"}}/>
      </div>
      <div className="document-name">
        <input type="text" value={documentName} placeholder={"Untitled"} onChange={(e) => {
            loadDocumentName(e.target.value)
        }}/>
      </div>
      <div style={{display: "flex", background: "#2f2f2f", padding: "4px", borderRadius: "8px", gap: "4px", marginTop: "8px"}}>
        {children}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <button 
            onMouseDown={(e) => {
              e.preventDefault();
              setShowTableSelector(!showTableSelector);
            }}
          >
            Insert
          </button>
          {showTableSelector && (
            <div 
              style={{
                position: 'absolute',
                top: '100%',
                left: '0',
                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                border: '1px solid #444',
                borderRadius: '4px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                zIndex: 1000,
                minWidth: '120px',
              }}
              onMouseLeave={() => setShowTableSelector(false)}
            >
              <div
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleInsertImage();
                  setShowTableSelector(false);
                }}
                style={{
                  padding: '8px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #444',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#333'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
              Image
              </div>
              <div style={{ position: 'relative' }}>
                <div
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleInsertTable(2, 2);
                  }}
                  style={{
                    padding: '8px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#333';
                    const selector = e.currentTarget.nextElementSibling as HTMLElement;
                    if (selector) selector.style.display = 'block';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <span>Table</span>
                  <span></span>
                </div>
                <div
                  style={{
                    display: 'none',
                    position: 'absolute',
                    left: '100%',
                    top: '0',
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.display = 'block'}
                  onMouseLeave={(e) => e.currentTarget.style.display = 'none'}
                >
                  <TableSizeSelector onSelect={handleInsertTable} />
                </div>
              </div>
            </div>
          )}
        </div>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <button 
            onMouseDown={(e) => {
              e.preventDefault();
              setShowFormatDropdown(!showFormatDropdown);
            }}
          >
            Format
          </button>
          {showFormatDropdown && (
            <div 
              style={{
                position: 'absolute',
                top: '100%',
                left: '0',
                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                border: '1px solid #444',
                borderRadius: '4px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                zIndex: 1000,
                minWidth: '150px',
              }}
              onMouseLeave={() => setShowFormatDropdown(false)}
            >
              {formatOptions.map((option, index) => (
                <Popup
                  key={option.value}
                  content={option.shortcut}
                  position="right"
                  delay={500}
                >
                  <div
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleFormatSelect(option.value);
                      setShowFormatDropdown(false);
                    }}
                    style={{
                      padding: '8px 16px',
                      cursor: 'pointer',
                      borderBottom: index < formatOptions.length - 1 ? '1px solid #444' : 'none',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#333'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    {option.label}
                  </div>
                </Popup>
              ))}
            </div>
          )}
        </div>
      </div>
      <Modal
        isOpen={showLinkPopup}
        onClose={() => {
          setShowLinkPopup(false);
          setLinkUrl('');
          setLinkText('');
        }}
        title="Insert Link"
      >
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>URL:</label>
          <input
            type="text"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://example.com"
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: '#1e1e1e',
              border: '1px solid #444',
              borderRadius: '4px',
              color: '#fff',
              fontSize: '14px',
            }}
            autoFocus
          />
        </div>
        {!hasSelection && (
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>Link Text:</label>
            <input
              type="text"
              value={linkText}
              onChange={(e) => setLinkText(e.target.value)}
              placeholder="Enter link text"
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: '#1e1e1e',
                border: '1px solid #444',
                borderRadius: '4px',
                color: '#fff',
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
              backgroundColor: '#444',
              border: 'none',
              borderRadius: '4px',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              applyLink();
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: '#4dabf7',
              border: 'none',
              borderRadius: '4px',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Apply
          </button>
        </div>
      </Modal>
    </div>
  );
}
