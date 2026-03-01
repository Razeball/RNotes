import { useState, useEffect, useRef } from 'react'
import { Editor, Text, Range } from 'slate'
import { ReactEditor } from 'slate-react'
import Dropdown, { DropdownOption } from './Dropdown'
import Popup from './Popup'
import Modal from './Modal'
import {
    EditorInstance,
    EditorWithLinkActions,
    toggleBold,
    toggleItalic,
    toggleUnderline,
    eraseFormatting as eraseFormattingAction,
    setAlignment,
    changeTextStyle as changeTextStyleAction,
    toggleUnorderedList,
    toggleOrderedList,
    setFontSize as applyFontSize,
    setColor as applyColor,
    setFontFamily as applyFontFamily,
    insertLinkMark,
    removeLink,
    getHeaders as getHeadersAction,
} from '../editorActions'


type ToolbarProps = {
    editor: EditorInstance
}

const Toolbar = ({ editor }: ToolbarProps) => {
    const [fontSize, setFontSize] = useState<string>('16')
    const [textColor, setTextColor] = useState<string>('black')
    const [fontFamily, setFontFamily] = useState<string>('Arial')
    const [fontSearch, setFontSearch] = useState<string>('Arial')
    const [showFontDropdown, setShowFontDropdown] = useState(false)
    const [isFontDropdownAnimating, setIsFontDropdownAnimating] = useState(false)
    const [isFontSearching, setIsFontSearching] = useState(false)
    const fontDropdownRef = useRef<HTMLDivElement>(null)
    const [showLinkModal, setShowLinkModal] = useState(false)
    const [showHeaderLinkModal, setShowHeaderLinkModal] = useState(false)
    const [linkUrl, setLinkUrl] = useState('')
    const [headers, setHeaders] = useState<{ id: string; text: string; type: string }[]>([])

    const availableFonts = [
        'Arial',
        'Times New Roman',
        'Courier New',
        'Georgia',
        'Verdana',
        'Helvetica',
        'Trebuchet MS',
        'Comic Sans MS',
        'Impact',
        'Lucida Console',
        'Arimo',
        'Google Sans Code',
        'Jacquard 12',
        'Roboto Flex',
        'Tinos',
    ]

    const filteredFonts = isFontSearching && fontSearch.trim() !== ''
        ? availableFonts.filter(f =>
            f.toLowerCase().includes(fontSearch.toLowerCase())
        )
        : availableFonts
    

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
                    }
                    if ('fontFamily' in marks && marks.fontFamily !== undefined) {
                        setFontFamily(marks.fontFamily)
                        setFontSearch(marks.fontFamily)
                    }
                }

                const textNodesWithSize = Array.from(Editor.nodes(editor, {
                    at: selection,
                    match: (n: any) => Text.isText(n),
                }))

                const fontSizes = new Set<number>()
                const colors = new Set<string>()
                const fontFamilies = new Set<string>()
                
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
                        if (node.fontFamily !== undefined) {
                            fontFamilies.add(node.fontFamily)
                        } else {
                            fontFamilies.add('Arial')
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

                if (fontFamilies.size > 1) {
                    setFontFamily('')
                    setFontSearch('')
                } else if (fontFamilies.size === 1) {
                    const ff = Array.from(fontFamilies)[0]
                    setFontFamily(ff)
                    setFontSearch(ff)
                } else {
                    setFontFamily('Arial')
                    setFontSearch('Arial')
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
                        toggleBold(editor)
                        break;
                    case 'i':
                        toggleItalic(editor)
                        break;  
                    case 'u':
                        toggleUnderline(editor)
                        break;
                    case "\\":
                        eraseFormattingAction(editor)
                        break;
                    default:
                        break;
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);
    
    const handleToggleBold = (event?: React.MouseEvent) => {
        event?.preventDefault()
        toggleBold(editor)
    }

    const handleToggleItalic = (event?: React.MouseEvent) => {
        event?.preventDefault()
        toggleItalic(editor)
    }

    const handleToggleUnderline = (event?: React.MouseEvent) => {
        event?.preventDefault()
        toggleUnderline(editor)
    }

    const handleEraseFormatting = (event?: React.MouseEvent) => {
        event?.preventDefault()
        eraseFormattingAction(editor)
    }

    const alignStart = (event: React.MouseEvent) => {
        event.preventDefault()
        setAlignment(editor, 'start')
    }

    const alignCenter = (event: React.MouseEvent) => {
        event.preventDefault()
        setAlignment(editor, 'center')
    }

    const alignEnd = (event: React.MouseEvent) => {
        event.preventDefault()
        setAlignment(editor, 'end')
    }

    const alignJustify = (event: React.MouseEvent) => {
        event.preventDefault()
        setAlignment(editor, 'justify')
    }

    const changeTextStyle = (style: 'paragraph' | 'header' | 'header2' | 'header3' | 'header4') => {
        changeTextStyleAction(editor, style)
    }

    const makeUnorderedList = (event: React.MouseEvent) => {
        event.preventDefault()
        toggleUnorderedList(editor)
    }

    const makeOrderedList = (event: React.MouseEvent) => {
        event.preventDefault()
        toggleOrderedList(editor)
    }

    const handleFontSizeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value
        setFontSize(value)
        
        if (value && !isNaN(Number(value))) {
            const numSize = Number(value)
            applyFontSize(editor, numSize)
            ReactEditor.focus(editor)
        }
    }

    const handleSelectSize = (size: number) => {
        setFontSize(String(size))
        applyFontSize(editor, size)
        ReactEditor.focus(editor)
    }

    const handleSelectFont = (font: string) => {
        setFontFamily(font)
        setFontSearch(font)
        applyFontFamily(editor, font)
        closeFontDropdown()
        ReactEditor.focus(editor)
    }

    const handleFontSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value
        setFontSearch(value)
        setIsFontSearching(true)
        if (!showFontDropdown) {
            setShowFontDropdown(true)
            setIsFontDropdownAnimating(true)
        }
    }

    const handleFontSearchBlur = () => {
        setTimeout(() => {
            if (!fontSearch.trim()) {
                handleSelectFont('Arial')
                return
            }
            const match = availableFonts.find(f => f.toLowerCase() === fontSearch.toLowerCase())
            if (match) {
                handleSelectFont(match)
            } else {
                handleSelectFont('Arial')
            }
        }, 200)
    }

    const handleFontSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            if (!fontSearch.trim()) {
                handleSelectFont('Arial')
                return
            }
            const match = availableFonts.find(f => f.toLowerCase() === fontSearch.toLowerCase())
            if (match) {
                handleSelectFont(match)
            } else {
                handleSelectFont('Arial')
            }
        }
    }

    const closeFontDropdown = () => {
        setIsFontDropdownAnimating(false)
        setIsFontSearching(false)
        setTimeout(() => setShowFontDropdown(false), 150)
    }

    useEffect(() => {
        const handleClickOutsideFont = (event: MouseEvent) => {
            if (fontDropdownRef.current && !fontDropdownRef.current.contains(event.target as globalThis.Node)) {
                closeFontDropdown()
            }
        }
        if (showFontDropdown) {
            document.addEventListener('mousedown', handleClickOutsideFont)
        }
        return () => document.removeEventListener('mousedown', handleClickOutsideFont)
    }, [showFontDropdown])

    const handleSelectColor = (color: 'red' | 'blue' | 'white' | 'black' | 'green') => {
        setTextColor(color)
        applyColor(editor, color)
        ReactEditor.focus(editor)
    }

    const insertHeaderLink = (headerId: string) => {
        insertLinkMark(editor, `#${headerId}`)
        setShowHeaderLinkModal(false)
        ReactEditor.focus(editor)
    }

    const insertLink = () => {
        if (!linkUrl) return
        insertLinkMark(editor, linkUrl)
        setShowLinkModal(false)
        setLinkUrl('')
        ReactEditor.focus(editor)
    }

    const linkActions = {
        openLinkModal: () => {
            const { selection } = editor
            if (!selection || Range.isCollapsed(selection)) {
                alert('Please select text to create a link')
                return
            }
            setLinkUrl('')
            setShowLinkModal(true)
        },
        openHeaderLinkModal: () => {
            const { selection } = editor
            if (!selection || Range.isCollapsed(selection)) {
                alert('Please select text to create a link')
                return
            }
            const foundHeaders = getHeadersAction(editor)
            setHeaders(foundHeaders)
            setShowHeaderLinkModal(true)
        },
        removeLink: () => {
            removeLink(editor)
        }
    }

    ;(editor as EditorWithLinkActions).linkActions = linkActions

    return (
        <div className='toolbar'>
            <Popup
            content="Ctrl+b"
            position="bottom"
            delay={300}>
            <button onMouseDown={handleToggleBold}><b>B</b></button>
            </Popup>
            <Popup
            content="Ctrl+i"
            position="bottom"
            delay={300}>
            <button onMouseDown={handleToggleItalic}><i>I</i></button>
            </Popup>
            <Popup
            content="Ctrl+u"
            position="bottom"
            delay={300}>
            <button onMouseDown={handleToggleUnderline}><u>U</u></button>
            </Popup>
            <Popup
            content="Ctrl+\"
            position="bottom"
            delay={300}>
            <button onMouseDown={handleEraseFormatting}><img src='NoFormat.svg'/></button>
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

            {/* Font Selector */}
            <div ref={fontDropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
                <input
                    type="text"
                    value={fontSearch}
                    onChange={handleFontSearchChange}
                    onBlur={handleFontSearchBlur}
                    onKeyDown={handleFontSearchKeyDown}
                    onFocus={(e) => {
                        e.target.select()
                        setIsFontSearching(false)
                        setShowFontDropdown(true)
                        setIsFontDropdownAnimating(true)
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{ width: '130px', marginLeft: '10px', fontFamily: fontFamily || 'Arial' }}
                    placeholder="Font"
                />
                {showFontDropdown && (
                    <div
                        className={`dropdown-menu value-dropdown-menu ${isFontDropdownAnimating ? 'open' : 'closing'}`}
                        style={{ maxHeight: '200px', overflowY: 'auto', width: '200px' }}
                        onMouseLeave={() => closeFontDropdown()}
                    >
                        {filteredFonts.length === 0 ? (
                            <div style={{ padding: '8px 16px', color: '#888', fontSize: '13px' }}>
                                No matching font found
                            </div>
                        ) : (
                            (() => {
                                const sortedFonts = fontFamily && !isFontSearching
                                    ? [fontFamily, ...filteredFonts.filter(f => f !== fontFamily)]
                                    : filteredFonts
                                return sortedFonts.map((font) => (
                                    <div
                                        key={font}
                                        onMouseDown={(e) => {
                                            e.preventDefault()
                                            handleSelectFont(font)
                                        }}
                                        className={`value-dropdown-item ${fontFamily === font ? 'selected' : ''}`}
                                        style={{ fontFamily: font, display: 'flex', alignItems: 'center', gap: '8px' }}
                                    >
                                        <span style={{ width: '16px', flexShrink: 0 }}>{fontFamily === font ? '✓' : ''}</span>
                                        <span>{font}</span>
                                    </div>
                                ))
                            })()
                        )}
                    </div>
                )}
            </div>

            {/* External Link Modal */}
            <Modal isOpen={showLinkModal} onClose={() => setShowLinkModal(false)} title="Insert Link">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <input
                        type="url"
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        placeholder="https://example.com"
                        style={{ padding: '8px', borderRadius: '4px', border: '1px solid #555' }}
                        autoFocus
                    />
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <button onClick={() => setShowLinkModal(false)}>Cancel</button>
                        <button onClick={insertLink} style={{ backgroundColor: '#4dabf7' }}>Insert</button>
                    </div>
                </div>
            </Modal>

            {/* Header Link Modal */}
            <Modal isOpen={showHeaderLinkModal} onClose={() => setShowHeaderLinkModal(false)} title="Link to Header">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
                    {headers.length === 0 ? (
                        <p style={{ color: '#888' }}>No headers found in the document. Create headers first.</p>
                    ) : (
                        headers.map((header, index) => (
                            <button
                                key={index}
                                onClick={() => insertHeaderLink(header.id)}
                                style={{
                                    padding: '10px',
                                    textAlign: 'left',
                                    backgroundColor: '#2f2f2f',
                                    border: '1px solid #555',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    paddingLeft: header.type === 'header2' ? '20px' : 
                                                 header.type === 'header3' ? '40px' : 
                                                 header.type === 'header4' ? '60px' : '10px'
                                }}
                            >
                                <span style={{ color: '#888', marginRight: '10px' }}>
                                    {header.type === 'header' ? 'H1' : 
                                     header.type === 'header2' ? 'H2' : 
                                     header.type === 'header3' ? 'H3' : 'H4'}
                                </span>
                                {header.text}
                            </button>
                        ))
                    )}
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                        <button onClick={() => setShowHeaderLinkModal(false)}>Cancel</button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}

export default Toolbar
