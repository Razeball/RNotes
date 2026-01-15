

import { BaseEditor, Editor } from 'slate'
import { ReactEditor } from 'slate-react'
import { HistoryEditor } from 'slate-history'
import { Transforms, Text } from 'slate'
import Dropdown, { DropdownOption } from './Dropdown'

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
  ]

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
