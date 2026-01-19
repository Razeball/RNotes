import { useState, useEffect } from 'react'
import { BaseEditor, Editor, Transforms, Text, Range, Element as SlateElement } from 'slate'
import { ReactEditor } from 'slate-react'
import { HistoryEditor } from 'slate-history'
import Dropdown, { DropdownOption } from './Dropdown'
import Popup from './Popup'


type ToolbarProps = {
    editor: BaseEditor & ReactEditor & HistoryEditor
}

const Toolbar = ({ editor }: ToolbarProps) => {
    const [fontSize, setFontSize] = useState<string>('16')
    const [textColor, setTextColor] = useState<string>('black')
    

    const colorOptions: DropdownOption<'red' | 'blue' | 'white' | 'black' | 'green'>[] = [
        { value: 'red', label: 'Red', color: 'red' },
        { value: 'blue', label: 'Blue', color: 'blue' },
        { value: 'white', label: 'White', color: 'white' },
        { value: 'black', label: 'Black', color: 'black' },
        { value: 'green', label: 'Green', color: 'green' },
    ];

    const fontSizeOptions: DropdownOption<number>[] = [
        { value: 12, label: '12px' },
        { value: 16, label: '16px' },
        { value: 20, label: '20px' },
        { value: 24, label: '24px' },
        { value: 32, label: '32px' },
    ];

    const textStyleOption: DropdownOption<string>[] = [
        { value: 'paragraph', label: 'Paragraph' },
        { value: 'header', label: 'Header 1' },
        { value: 'header2', label: 'Header 2' },
        { value: 'header3', label: 'Header 3' },
        { value: 'header4', label: 'Header 4' },
    ]

    const selectionKey = editor.selection 
        ? `${editor.selection.anchor.path.join(',')}-${editor.selection.anchor.offset}-${editor.selection.focus.path.join(',')}-${editor.selection.focus.offset}`
        : 'null'
    

    useEffect(() => {
        const updateFontSize = () => {
            try {
                const { selection } = editor
                if (!selection) {
                    setFontSize('16')
                    setTextColor('black')
                    return
                }

                const marks = Editor.marks(editor)
                if (marks && typeof marks === 'object') {
                    if ('fontSize' in marks && marks.fontSize !== undefined) {
                        setFontSize(String(marks.fontSize))
                    }
                    if ('color' in marks && marks.color !== undefined) {
                        setTextColor(marks.color)
                        return
                    }
                }

                const textNodesWithSize = Array.from(Editor.nodes(editor, {
                    at: selection,
                    match: (n: any) => Text.isText(n),
                }))

                const fontSizes = new Set<number>()
                const colors = new Set<string>()
                
                for (const [node] of textNodesWithSize) {
                    if (Text.isText(node)) {
                        if (node.fontSize !== undefined) {
                            fontSizes.add(node.fontSize)
                        } else {
                            fontSizes.add(16) 
                        }
                        if (node.color !== undefined) {
                            colors.add(node.color)
                        } else {
                            colors.add('black')
                        }
                    }
                }

                if (fontSizes.size > 1) {
                    setFontSize('')
                } else if (fontSizes.size === 1) {
                    setFontSize(String(Array.from(fontSizes)[0]))
                } else {
                    setFontSize('16')
                }

                if (colors.size === 1) {
                    setTextColor(Array.from(colors)[0])
                } else {
                    setTextColor('black')
                }
            } catch (e) {
                console.error('Error updating font size:', e)
                setFontSize('16')
                setTextColor('black')
            }
        }
        
        updateFontSize()
    }, [editor, selectionKey])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey) {
                switch (e.key) {
                    case 'b':
                        toggleBold()
                        break;
                    case 'i':
                        toogleItalic()
                        break;  
                    case 'u':
                        toogleUnderline()
                        break;
                    case "\\":
                        eraseFormatting()
                        break;
                    default:
                        break;
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);
    
    const toggleBold = (event?: React.MouseEvent) => {
        event?.preventDefault() 
        const [match] = Editor.nodes(editor, {
            match: (n: any) => n.bold === true, 
            universal: true
        })
        Transforms.setNodes(
            editor,
            { bold: match ? undefined : true },
            { match: (n: any) => Text.isText(n), split: true }
        )
    }

    const toogleItalic = (event?: React.MouseEvent) => {
        event?.preventDefault()
        const [match] = Editor.nodes(editor, {
            match: (n: any) => n.italic === true, 
            universal: true
        })
        Transforms.setNodes(
            editor,
            { italic: match ? undefined : true },
            { match: (n: any) => Text.isText(n), split: true }
        )
    }

    const toogleUnderline = (event?: React.MouseEvent) => {
        event?.preventDefault()
        const [match] = Editor.nodes(editor, {
            match: (n: any) => n.underline === true, 
            universal: true
        })
        Transforms.setNodes(
            editor,
            { underline: match ? undefined : true },
            { match: (n: any) => Text.isText(n), split: true }
        )
    }
    const eraseFormatting = (event?: React.MouseEvent) => {
        event?.preventDefault()
        const { selection } = editor
        if (!selection) return
        Transforms.setNodes(
            editor,
            { bold: undefined, italic: undefined, underline: undefined, fontSize: undefined, color: undefined, code: undefined, quote: undefined, crossedOut: undefined },
            { match: (n: any) => Text.isText(n), split: true }
        )
    }

    const alignStart = (event: React.MouseEvent) => {
        event.preventDefault()
        Transforms.setNodes(
            editor,
            { alignment: 'start' },
            { match: n => SlateElement.isElement(n) }
        )
    }

    const alignCenter = (event: React.MouseEvent) => {
        event.preventDefault()
        Transforms.setNodes(
            editor,
            { alignment: 'center' },
            { match: n => SlateElement.isElement(n) }
        )
    }

    const alignEnd = (event: React.MouseEvent) => {
        event.preventDefault()
        Transforms.setNodes(
            editor,
            { alignment: 'end' },
            { match: n => SlateElement.isElement(n) }
        )
    }

    const alignJustify = (event: React.MouseEvent) => {
        event.preventDefault()
        Transforms.setNodes(
            editor,
            { alignment: 'justify' },
            { match: n => SlateElement.isElement(n) }
        )
    }

    const changeTextStyle = (style: 'paragraph' | 'header' | 'header2' | 'header3' | 'header4') => {
        Transforms.setNodes(
            editor,
            { type: style },
            { match: n => SlateElement.isElement(n) }
        )
        ReactEditor.focus(editor)
    }

    const makeUnorderedList = (event: React.MouseEvent) => {
        event.preventDefault()
        const { selection } = editor
        if (!selection) return

        const [match] = Editor.nodes(editor, {
            match: n => SlateElement.isElement(n) && (n.type === 'ulist' || n.type === 'olist')
        })

        if (match) {
            Transforms.unwrapNodes(editor, {
                match: n => SlateElement.isElement(n) && (n.type === 'ulist' || n.type === 'olist'),
                split: true
            })
            Transforms.setNodes(editor, { type: 'paragraph' }, {
                match: n => SlateElement.isElement(n) && n.type === 'list-item'
            })
        } else {
            Transforms.setNodes(editor, { type: 'list-item' }, {
                match: n => SlateElement.isElement(n) && n.type === 'paragraph'
            })
            Transforms.wrapNodes(editor, { type: 'ulist', children: [] }, {
                match: n => SlateElement.isElement(n) && n.type === 'list-item'
            })
        }
    }

    const makeOrderedList = (event: React.MouseEvent) => {
        event.preventDefault()
        const { selection } = editor
        if (!selection) return

        const [match] = Editor.nodes(editor, {
            match: n => SlateElement.isElement(n) && (n.type === 'ulist' || n.type === 'olist')
        })

        if (match) {
            Transforms.unwrapNodes(editor, {
                match: n => SlateElement.isElement(n) && (n.type === 'ulist' || n.type === 'olist'),
                split: true
            })
            Transforms.setNodes(editor, { type: 'paragraph' }, {
                match: n => SlateElement.isElement(n) && n.type === 'list-item'
            })
        } else {
            Transforms.setNodes(editor, { type: 'list-item' }, {
                match: n => SlateElement.isElement(n) && n.type === 'paragraph'
            })
            Transforms.wrapNodes(editor, { type: 'olist', children: [] }, {
                match: n => SlateElement.isElement(n) && n.type === 'list-item'
            })
        }
    }

    const handleFontSizeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value
        setFontSize(value)
        
        if (value && !isNaN(Number(value))) {
            const numSize = Number(value)
            const { selection } = editor
            if (selection) {
                if (!Range.isCollapsed(selection)) {
                    Transforms.setNodes(
                        editor,
                        { fontSize: numSize },
                        { at: selection, match: (n: any) => Text.isText(n), split: true }
                    )
                }
                Editor.addMark(editor, 'fontSize', numSize)
                ReactEditor.focus(editor)
            }
        }
    }

    const handleSelectSize = (size: number) => {
        setFontSize(String(size))
        const { selection } = editor
        if (selection) {
            if (!Range.isCollapsed(selection)) {
                Transforms.setNodes(
                    editor,
                    { fontSize: size },
                    { at: selection, match: (n: any) => Text.isText(n), split: true }
                )
            }
            Editor.addMark(editor, 'fontSize', size)
        }
        ReactEditor.focus(editor)
    }

    const handleSelectColor = (color: 'red' | 'blue' | 'white' | 'black' | 'green') => {
        setTextColor(color)
        const { selection } = editor
        if (selection) {
            if (!Range.isCollapsed(selection)) {
                Transforms.setNodes(
                    editor,
                    { color: color },
                    { at: selection, match: (n: any) => Text.isText(n), split: true }
                )
            }
            Editor.addMark(editor, 'color', color)
        }
        ReactEditor.focus(editor)
    }

    return (
        <div className='toolbar'>
            <Popup
            content="Ctrl+b"
            position="bottom"
            delay={300}>
            <button onMouseDown={toggleBold}><b>B</b></button>
            </Popup>
            <Popup
            content="Ctrl+i"
            position="bottom"
            delay={300}>
            <button onMouseDown={toogleItalic}><i>I</i></button>
            </Popup>
            <Popup
            content="Ctrl+u"
            position="bottom"
            delay={300}>
            <button onMouseDown={toogleUnderline}><u>U</u></button>
            </Popup>
            <Popup
            content="Ctrl+\"
            position="bottom"
            delay={300}>
            <button onMouseDown={eraseFormatting}><img src='NoFormat.svg'/></button>
            </Popup>
            <button onMouseDown={alignStart}><img src="Left.svg" alt="" /></button>
            <button onMouseDown={alignCenter}><img src="Center.svg" alt="" /></button>
            <button onMouseDown={alignEnd}><img src="Right.svg" alt="" /></button>
            <button onMouseDown={alignJustify}><img src="Justify.svg" alt="" /></button>
            <button onMouseDown={makeUnorderedList}><img src="Unordered List.svg" alt="" /></button>
            <button onMouseDown={makeOrderedList}><img src="OrderedList.svg" alt="" /></button>
            
            <Dropdown
                options={textStyleOption}
                selectedValue={'paragraph'}
                onSelect={(value) => changeTextStyle(value as 'paragraph' | 'header' | 'header2' | 'header3' | 'header4')}
                renderButton={(value, _isOpen, toggle) => (
                    <button 
                        onMouseDown={(e) => {
                            e.preventDefault()
                            toggle()
                        }}
                    >
                        {value}
                    </button>
                )}
            />

            <Dropdown
                options={colorOptions}
                selectedValue={textColor as 'red' | 'blue' | 'white' | 'black' | 'green'}
                onSelect={handleSelectColor}
                renderButton={(value, _isOpen, toggle) => (
                    <button 
                        onMouseDown={(e) => {
                            e.preventDefault()
                            toggle()
                        }}
                        style={{ 
                            backgroundColor: value, 
                            color: value === 'white' || value === 'black' ? (value === 'white' ? 'black' : 'white') : 'white',
                            border: '1px solid #ccc',
                            width: '40px',
                            height: '30px',
                            marginLeft: '10px'
                        }}
                    >
                        A
                    </button>
                )}
            />

            <Dropdown
                options={fontSizeOptions}
                selectedValue={Number(fontSize) || 16}
                onSelect={handleSelectSize}
                renderButton={(_value, _isOpen, toggle) => (
                    <input 
                        type="number"
                        value={fontSize}
                        onChange={handleFontSizeChange}
                        onMouseDown={(e) => e.stopPropagation()}
                        onFocus={(e) => {
                            e.target.select()
                            toggle()
                        }}
                        onBlur={() => {}}
                        style={{ width: '70px', marginLeft: '10px' }}
                        placeholder="Size"
                    />
                )}
            />
        </div>
    )
}

export default Toolbar
