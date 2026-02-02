import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { createEditor, Descendant, BaseEditor, Transforms, Editor } from "slate";

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
import { convertFileSrc } from "@tauri-apps/api/core";
import Miscellaneousbar from "./components/Miscellaneousbar";
import React from "react";
import Popup from "./components/Popup";
import { TableElement} from "./components/Table";
import ActionDropdown, { ActionDropdownItem } from "./components/ActionDropdown";
import ContextMenu, { ContextMenuItem } from "./components/ContextMenu";
import ImageElement from "./components/ImageElement";
import StatusBar from "./components/StatusBar";


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
    | "image"
    | "table"
    | "table-row"
    | "table-cell";
  children: CustomText[] | CustomElement[];
  alignment?: "start" | "center" | "end" | "justify";
  url?: string;
  size?: ImageSize;
  caption?: string;
  subtitle?: string;
  title?: string;
  id?: string;
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
};


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

const initialValue: Descendant[] = [
  {
    type: "paragraph",
    alignment: "start",
    children: [
      { text: "write something ", italic: true, color: "red" },
      { text: "Amazing", bold: true, color: "white" },
    ],
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

const MySlateEditor = () => {
  const [value, setValue] = useState<Descendant[]>(initialValue);
  const [changed, setChanged] = useState(false);
  const [key, setKey] = useState(0);
  const [documentName, setDocumentName] = useState("Document");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const [characterCount, setCharacterCount] = useState(0);
  const isInitialMount = useRef(true);
  const editor = useMemo(() => withImages(withHistory(withReact(createEditor()))), [key]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
        }
      }
      else if (e.ctrlKey && e.altKey && e.ctrlKey === 's'){
        saveAs();
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [changed]);

  useEffect(() => {
    invoke("editor_changed", { hasChanged: changed });
  }, [changed]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setChanged(true);
  }, [value]);


  const handlePaste = useCallback(async (event: React.ClipboardEvent) => {
    const clipboardData = event.clipboardData;
    

    if (clipboardData.files && clipboardData.files.length > 0) {
      const file = clipboardData.files[0];
      if (file.type.startsWith('image/')) {
        event.preventDefault();
        try {
          const filePath = await invoke<string>("insert_image_from_clipboard");
          const url = convertFileSrc(filePath);
          insertImage(editor, url);
        } catch (error) {
          console.error("Error pasting image:", error);
        }
        return;
      }
    }
    

    const items = clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        event.preventDefault();
        try {
          const filePath = await invoke<string>("insert_image_from_clipboard");
          const url = convertFileSrc(filePath);
          insertImage(editor, url);
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
    if (!selection) {
      setCursorPosition({ line: 1, column: 1 });
      return;
    }

    const [start] = Editor.edges(editor, selection);
    const path = start.path;
    
    let line = 1;
    for (let i = 0; i < path[0]; i++) {
      line++;
    }
    
    const column = start.offset + 1;
    
    setCursorPosition({ line, column });
  }, [editor]);

  useEffect(() => {
    setCharacterCount(calculateCharacterCount(value));
  }, [value, calculateCharacterCount]);

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

  type Data = [Descendant[], string];

  const getDocumentName = (name: string) => {
    setDocumentName(name);
  };

  async function save() {
    alert(await invoke("save", { document: value, documentName:  documentName}));
    setChanged(false);
  }
  async function saveAs() {
    alert(await invoke("save_as", { document: value, documentName:  documentName}));
    setChanged(false);
  }
  async function print() {
    try {
      await invoke("save", { document: value, documentName: documentName });
      setChanged(false);
      window.print();
    } catch (error) {
      console.error("Error printing:", error);
    }
  }
  async function open() {
    try {
      const [loadedDocument, loadedName] = await invoke<Data>("open");
      isInitialMount.current = true; 
      setValue(loadedDocument);
      setKey((prev) => prev + 1); // Forced restart
      setChanged(false);
      setDocumentName(loadedName);
    } catch (error) {
      alert(`Error opening file: ${error}`);
    }
  }

  async function newDocument() {
    const confirmed = await invoke<boolean>("confirm_discard_changes");
    if (!confirmed) {
      return;
    }
    isInitialMount.current = true; 
    setValue(initialValue);
    setKey((prev) => prev + 1);
    setChanged(false);
    setDocumentName("Document");
  }

  const fileMenuItems: ActionDropdownItem[] = [
    { id: 'new', label: 'New', tooltip: 'Create a new document', shortcut: 'Ctrl+N', divider: true },
    { id: 'open', label: 'Open', tooltip: 'Open an existing document', shortcut: 'Ctrl+O', divider: true },
    { id: 'save', label: 'Save', tooltip: 'Save the current document', shortcut: 'Ctrl+S' },
    { id: 'saveAs', label: 'Save As', tooltip: 'Save or export the document', shortcut: 'Ctrl+Alt+S', divider: true },
    { id: 'print', label: 'Print', tooltip: 'Print the document', shortcut: 'Ctrl+P' },
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
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
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
    const linkActions = (editor as any).linkActions;
    if (linkActions) {
      linkActions.openLinkModal();
    }
  };

  const handleLinkToHeader = () => {
    handleCloseContextMenu();
    const linkActions = (editor as any).linkActions;
    if (linkActions) {
      linkActions.openHeaderLinkModal();
    }
  };

  const handleRemoveLink = () => {
    handleCloseContextMenu();
    const linkActions = (editor as any).linkActions;
    if (linkActions) {
      linkActions.removeLink();
    }
  };

  const contextMenuItems: ContextMenuItem[] = [
    { id: 'copy', label: 'Copy', onClick: handleCopy },
    { id: 'cut', label: 'Cut', onClick: handleCut },
    { id: 'paste', label: 'Paste', onClick: handlePasteFromContextMenu, divider: true },
    { id: 'insertLink', label: 'Insert Link', onClick: handleInsertLink },
    { id: 'linkToHeader', label: 'Link to Header', onClick: handleLinkToHeader },
    { id: 'removeLink', label: 'Remove Link', onClick: handleRemoveLink },
  ];


  return (
    <div>
      <div className="miscellaneous-bar">
        <Miscellaneousbar loadDocumentName={getDocumentName} documentName={documentName} editor={editor}>    
          <ActionDropdown
          items={fileMenuItems}
          onSelect={handleFileAction}
          renderButton={(_isOpen, toggle) => (
            <button onMouseDown={(e) => { e.preventDefault(); toggle(); }}>
                File
              </button>
            )}
          />
        </Miscellaneousbar>
      </div>
      <div className="editor-wrapper" onContextMenu={handleContextMenu}>
        <div className="editor-container">
          <Slate
            key={key}
            editor={editor}
            initialValue={value}
            onChange={(v) => {
              setValue(v)
              updateCursorPosition()
            }}
          >
            <div className="toolbar">
              <Toolbar editor={editor} />
            </div>
            <div className="editor-content">
              <Editable
                renderElement={renderElement}
                renderLeaf={renderLeaf}
                placeholder="Start Writing something..."
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
              />
            </div>
          </Slate>
        </div>
      </div>
      <StatusBar
        characterCount={characterCount}
        line={cursorPosition.line}
        column={cursorPosition.column}
        isSaved={!changed}
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
