import { BaseEditor, Editor, Transforms, Text, Range, Element as SlateElement, Node } from 'slate'
import { ReactEditor } from 'slate-react'
import { HistoryEditor } from 'slate-history'

export type EditorInstance = BaseEditor & ReactEditor & HistoryEditor

// styles

export const toggleBold = (editor: EditorInstance) => {
    const [match] = Editor.nodes(editor, {
        match: (n: any) => n.bold === true,
        universal: true,
    })
    Transforms.setNodes(
        editor,
        { bold: match ? undefined : true },
        { match: (n: any) => Text.isText(n), split: true }
    )
}

export const toggleItalic = (editor: EditorInstance) => {
    const [match] = Editor.nodes(editor, {
        match: (n: any) => n.italic === true,
        universal: true,
    })
    Transforms.setNodes(
        editor,
        { italic: match ? undefined : true },
        { match: (n: any) => Text.isText(n), split: true }
    )
}

export const toggleUnderline = (editor: EditorInstance) => {
    const [match] = Editor.nodes(editor, {
        match: (n: any) => n.underline === true,
        universal: true,
    })
    Transforms.setNodes(
        editor,
        { underline: match ? undefined : true },
        { match: (n: any) => Text.isText(n), split: true }
    )
}

export const eraseFormatting = (editor: EditorInstance) => {
    const { selection } = editor
    if (!selection) return
    Transforms.setNodes(
        editor,
        {
            bold: undefined,
            italic: undefined,
            underline: undefined,
            fontSize: undefined,
            color: undefined,
            code: undefined,
            quote: undefined,
            crossedOut: undefined,
            highlight: undefined,
            href: undefined,
            link: undefined,
            fontFamily: undefined,
        },
        { match: (n: any) => Text.isText(n), split: true }
    )
}

// alignment

export const setAlignment = (editor: EditorInstance, alignment: 'start' | 'center' | 'end' | 'justify') => {
    Transforms.setNodes(
        editor,
        { alignment },
        { match: (n) => SlateElement.isElement(n) }
    )
}

//text style

export const changeTextStyle = (editor: EditorInstance, style: 'paragraph' | 'header' | 'header2' | 'header3' | 'header4') => {
    Transforms.setNodes(
        editor,
        { type: style },
        { match: (n) => SlateElement.isElement(n) }
    )
    ReactEditor.focus(editor)
}

// list

export const toggleUnorderedList = (editor: EditorInstance) => {
    const { selection } = editor
    if (!selection) return

    const [match] = Editor.nodes(editor, {
        match: (n) => SlateElement.isElement(n) && (n.type === 'ulist' || n.type === 'olist'),
    })

    if (match) {
        Transforms.unwrapNodes(editor, {
            match: (n) => SlateElement.isElement(n) && (n.type === 'ulist' || n.type === 'olist'),
            split: true,
        })
        Transforms.setNodes(editor, { type: 'paragraph' }, {
            match: (n) => SlateElement.isElement(n) && n.type === 'list-item',
        })
    } else {
        Transforms.setNodes(editor, { type: 'list-item' }, {
            match: (n) => SlateElement.isElement(n) && n.type === 'paragraph',
        })
        Transforms.wrapNodes(editor, { type: 'ulist', children: [] }, {
            match: (n) => SlateElement.isElement(n) && n.type === 'list-item',
        })
    }
}

export const toggleOrderedList = (editor: EditorInstance) => {
    const { selection } = editor
    if (!selection) return

    const [match] = Editor.nodes(editor, {
        match: (n) => SlateElement.isElement(n) && (n.type === 'ulist' || n.type === 'olist'),
    })

    if (match) {
        Transforms.unwrapNodes(editor, {
            match: (n) => SlateElement.isElement(n) && (n.type === 'ulist' || n.type === 'olist'),
            split: true,
        })
        Transforms.setNodes(editor, { type: 'paragraph' }, {
            match: (n) => SlateElement.isElement(n) && n.type === 'list-item',
        })
    } else {
        Transforms.setNodes(editor, { type: 'list-item' }, {
            match: (n) => SlateElement.isElement(n) && n.type === 'paragraph',
        })
        Transforms.wrapNodes(editor, { type: 'olist', children: [] }, {
            match: (n) => SlateElement.isElement(n) && n.type === 'list-item',
        })
    }
}

// fontsize, color, font

export const setFontSize = (editor: EditorInstance, size: number) => {
    const { selection } = editor
    if (!selection) return
    if (!Range.isCollapsed(selection)) {
        Transforms.setNodes(
            editor,
            { fontSize: size },
            { at: selection, match: (n: any) => Text.isText(n), split: true }
        )
    }
    Editor.addMark(editor, 'fontSize', size)
}

export const setColor = (editor: EditorInstance, color: 'red' | 'blue' | 'white' | 'black' | 'green') => {
    const { selection } = editor
    if (!selection) return
    if (!Range.isCollapsed(selection)) {
        Transforms.setNodes(
            editor,
            { color },
            { at: selection, match: (n: any) => Text.isText(n), split: true }
        )
    }
    Editor.addMark(editor, 'color', color)
}

export const setFontFamily = (editor: EditorInstance, fontFamily: string) => {
    const { selection } = editor
    if (!selection) return
    if (!Range.isCollapsed(selection)) {
        Transforms.setNodes(
            editor,
            { fontFamily },
            { at: selection, match: (n: any) => Text.isText(n), split: true }
        )
    }
    Editor.addMark(editor, 'fontFamily', fontFamily)
}

// link

export const insertLinkMark = (editor: EditorInstance, href: string) => {
    const { selection } = editor
    if (selection && !Range.isCollapsed(selection)) {
        Transforms.setNodes(
            editor,
            { link: true, href },
            { at: selection, match: (n: any) => Text.isText(n), split: true }
        )
    }
}

export const removeLink = (editor: EditorInstance) => {
    Transforms.setNodes(
        editor,
        { link: undefined, href: undefined },
        { match: (n: any) => Text.isText(n), split: true }
    )
}

// header

const generateId = (text: string) => {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 50)
}

export const getHeaders = (editor: EditorInstance) => {
    const headerTypes = ['header', 'header2', 'header3', 'header4']
    const foundHeaders: { id: string; text: string; type: string }[] = []

    for (const [node, path] of Node.nodes(editor)) {
        if (SlateElement.isElement(node) && headerTypes.includes(node.type)) {
            const text = Node.string(node)
            const id = node.id || generateId(text)

            if (!node.id && text) {
                Transforms.setNodes(editor, { id }, { at: path })
            }

            if (text) {
                foundHeaders.push({ id, text, type: node.type })
            }
        }
    }

    return foundHeaders
}

// link action

export interface LinkActions {
    openLinkModal: () => void
    openHeaderLinkModal: () => void
    removeLink: () => void
}

export interface EditorWithLinkActions extends EditorInstance {
    linkActions?: LinkActions
}
export interface SearchMatch {
    path: number[]
    offset: number
    length: number
}

export const findTextMatches = (
    editor: EditorInstance,
    searchTerm: string,
    matchCase: boolean,
    matchWholeWord: boolean
): SearchMatch[] => {
    if (!searchTerm) return []

    const matches: SearchMatch[] = []

    for (const [node, path] of Node.nodes(editor)) {
        if (!Text.isText(node)) continue
        const text = matchCase ? node.text : node.text.toLowerCase()
        const term = matchCase ? searchTerm : searchTerm.toLowerCase()

        if (matchWholeWord) {
            const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const regex = new RegExp(`\\b${escapedTerm}\\b`, matchCase ? 'g' : 'gi')
            const source = node.text
            let m: RegExpExecArray | null
            while ((m = regex.exec(source)) !== null) {
                matches.push({ path: [...path], offset: m.index, length: term.length })
            }
        } else {
            let startIndex = 0
            while (true) {
                const idx = text.indexOf(term, startIndex)
                if (idx === -1) break
                matches.push({ path: [...path], offset: idx, length: term.length })
                startIndex = idx + 1
            }
        }
    }

    return matches
}

export const replaceMatch = (editor: EditorInstance, match: SearchMatch, replaceTerm: string) => {
    const range = {
        anchor: { path: match.path, offset: match.offset },
        focus: { path: match.path, offset: match.offset + match.length },
    }
    Transforms.select(editor, range)
    Transforms.insertText(editor, replaceTerm)
}

export const replaceAllMatches = (
    editor: EditorInstance,
    searchTerm: string,
    replaceTerm: string,
    matchCase: boolean,
    matchWholeWord: boolean
) => {
    const matches = findTextMatches(editor, searchTerm, matchCase, matchWholeWord)
    for (let i = matches.length - 1; i >= 0; i--) {
        replaceMatch(editor, matches[i], replaceTerm)
    }
}

export interface SelectionInfo {
    fontSize: string
    color: string
    fontFamily: string
}

export const getSelectionInfo = (editor: EditorInstance): SelectionInfo => {
    const defaults: SelectionInfo = { fontSize: '16', color: 'black', fontFamily: 'Arial' }
    const { selection } = editor
    if (!selection) return defaults

    try {
        const marks = Editor.marks(editor)
        if (marks && typeof marks === 'object') {
            if ('fontSize' in marks && marks.fontSize !== undefined) {
                defaults.fontSize = String(marks.fontSize)
            }
            if ('color' in marks && marks.color !== undefined) {
                defaults.color = marks.color
            }
            if ('fontFamily' in marks && marks.fontFamily !== undefined) {
                defaults.fontFamily = marks.fontFamily
            }
        }

        const textNodes = Array.from(Editor.nodes(editor, {
            at: selection,
            match: (n: any) => Text.isText(n),
        }))

        const fontSizes = new Set<number>()
        const colors = new Set<string>()
        const fontFamilies = new Set<string>()

        for (const [node] of textNodes) {
            if (Text.isText(node)) {
                fontSizes.add(node.fontSize ?? 16)
                colors.add(node.color ?? 'black')
                fontFamilies.add(node.fontFamily ?? 'Arial')
            }
        }

        if (fontSizes.size > 1) defaults.fontSize = ''
        else if (fontSizes.size === 1) defaults.fontSize = String(Array.from(fontSizes)[0])

        if (colors.size > 1) defaults.color = 'black'
        else if (colors.size === 1) defaults.color = Array.from(colors)[0]

        if (fontFamilies.size > 1) defaults.fontFamily = ''
        else if (fontFamilies.size === 1) defaults.fontFamily = Array.from(fontFamilies)[0]
    } catch (e) {
        console.error('Error reading selection info:', e)
    }

    return defaults
}
