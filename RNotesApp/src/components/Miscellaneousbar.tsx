

import { BaseEditor, Editor, } from 'slate'
import { ReactEditor } from 'slate-react'
import { HistoryEditor } from 'slate-history'
import { Transforms, Text } from 'slate'
import { useEffect } from 'react'
import Dropdown, { DropdownOption } from './Dropdown'
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { insertImage } from '../Editor'

export type MiscellaneousbarProps = {
    children?: React.ReactNode
    loadDocumentName: (name: string) => void
    documentName: string
    editor: BaseEditor & ReactEditor & HistoryEditor
}
export default function Miscellaneousbar({children, loadDocumentName, documentName, editor} : MiscellaneousbarProps) {
  
  const formatOptions: DropdownOption<'quote' | 'code' | 'crossedOut'>[] = [
    { value: 'quote', label: 'Quote' },
    { value: 'code', label: 'Code' },
    { value: 'crossedOut', label: 'Crossed Out' },
  ];
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
                      default:
                          break;
                  }
              }
          };
  
          window.addEventListener("keydown", handleKeyDown);
          return () => window.removeEventListener("keydown", handleKeyDown);
      }, []);

  const handleFormatSelect = (format: 'quote' | 'code' | 'crossedOut') => {
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
        <button onClick={handleInsertImage}>Insert Image</button>
        <Dropdown
          options={formatOptions}
          selectedValue={'quote'}
          onSelect={handleFormatSelect}
          renderButton={(_value, _isOpen, toggle) => (
            <button 
              onMouseDown={(e) => {
                e.preventDefault()
                toggle()
              }}
              
            >
              Format
            </button>
          )}
        />
      </div>
    </div>
  );
}
