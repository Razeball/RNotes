import { useState, useMemo, useCallback, useEffect } from "react";
import { createEditor, Descendant, BaseEditor, Transforms, Editor } from "slate";

import {
  Slate,
  Editable,
  withReact,
  RenderElementProps,
  RenderLeafProps,
  ReactEditor,
  useSlateStatic,
} from "slate-react";
import { withHistory, HistoryEditor } from "slate-history";
import Toolbar from "./components/Toolbar";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import Miscellaneousbar from "./components/Miscellaneousbar";
import React from "react";
import Popup from "./components/Popup";
import { TableElement} from "./components/Table";


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

const getImageWidth = (size?: ImageSize): string => {
  switch (size) {
    case "small":
      return "25%";
    case "medium":
      return "50%";
    case "large":
      return "75%";
    case "original":
    default:
      return "100%";
  }
};

const ImageElement = ({ attributes, children, element }: RenderElementProps) => {
  const editor = useSlateStatic();
  const imageWidth = getImageWidth(element.size);
  
  const handleResize = (size: ImageSize) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { size } as Partial<CustomElement>, { at: path });
  };

  const sizeButtons = (
    <div style={{ display: 'flex', gap: '4px' }}>
      <button 
        className={element.size === 'small' ? 'active' : ''} 
        onClick={() => handleResize('small')}
      >
        Small
      </button>
      <button 
        className={element.size === 'medium' ? 'active' : ''} 
        onClick={() => handleResize('medium')}
      >
        Medium
      </button>
      <button 
        className={element.size === 'large' ? 'active' : ''} 
        onClick={() => handleResize('large')}
      >
        Big
      </button>
      <button 
        className={element.size === 'original' || !element.size ? 'active' : ''} 
        onClick={() => handleResize('original')}
      >
        Original
      </button>
    </div>
  );

  return (
    <div {...attributes} style={{textAlign: 'center', margin: "10px 0"}}>
      <Popup 
        content={sizeButtons} 
        position="top" 
        delay={200}
        interactive={true}
      >
        <img 
          src={element.url} 
          alt="" 
          style={{maxWidth: imageWidth, cursor: 'pointer'}}
          contentEditable={false}
        />
      </Popup>
      {children}
    </div>
  );
};

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
        <h1 {...attributes} style={style}>
          {children}
        </h1>
      );
    case "header2":
      return (
        <h2 {...attributes} style={style}>
          {children}
        </h2>
      );
    case "header3":
      return (
        <h3 {...attributes} style={style}>
          {children}
        </h3>
      );
    case "header4":
      return (
        <h4 {...attributes} style={style}>
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
    styledChildren = (
      <Popup content={leaf.href} position="bottom" delay={300}>
        <a href={leaf.href} target="_blank" rel="noopener noreferrer" style={{color: '#4dabf7', textDecoration: 'underline'}}>{styledChildren}</a>
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
export const insertImage = (editor: ReactEditor, url: string, size: ImageSize = "original") => {
    const image: CustomElement = {
      type: "image", 
      url,
      size,
      children: [{text: ""}],
    };
    editor.insertNode(image);
  };

const MySlateEditor = () => {
  const [value, setValue] = useState<Descendant[]>(initialValue);
  const [changed, setChanged] = useState(false);
  const [key, setKey] = useState(0);
  const [documentName, setDocumentName] = useState("Document");
  const editor = useMemo(() => withHistory(withReact(createEditor())), [key]);

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
        }
      }
      else if (e.ctrlKey && e.altKey && e.ctrlKey === 's'){
        saveAs();
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
  useEffect(() => {
    setChanged(true);
    invoke("editor_changed", {hasChanged: changed});
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

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
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
  }
  async function saveAs() {
    alert(await invoke("save_as", { document: value, documentName:  documentName}));
  }
  async function open() {
    try {
      const [loadedDocument, loadedName] = await invoke<Data>("open");
      setValue(loadedDocument);
      setKey((prev) => prev + 1); // Forced restart
      setChanged(false);
      setDocumentName(loadedName);
    } catch (error) {
      alert(`Error opening file: ${error}`);
    }
  }


  return (
    <div>
      <Miscellaneousbar loadDocumentName={getDocumentName} documentName={documentName} editor={editor}>    
        <Popup
        content="Save the current document (ctr+s)"
        position="bottom"
        delay={300}>
           <button onClick={save}>Save</button>
        </Popup>
        <Popup
        content="Save or export the current document (ctr+alt+s)"
        position="bottom"
        delay={300}>
           <button onClick={saveAs}>Save As</button>
        </Popup>
        <Popup
        content="Open a document (ctrl+o)"
        position="bottom"
        delay={300}>
           <button onClick={open}>Open</button>
        </Popup>
       
      </Miscellaneousbar>
      <div
        style={{ border: "1px solid #ccc", padding: "20px", height: "80vh", overflowY: "auto" }}
      >
        <Slate
          key={key}
          editor={editor}
          initialValue={value}
          onChange={(v) => {
            setValue(v)
          }}
        >
          <Toolbar editor={editor} />
          <Editable
            style={{ height: "80%", paddingLeft: "10px", overflowY: "auto" }}
            renderElement={renderElement}
            renderLeaf={renderLeaf}
            placeholder="Start Writing something..."
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
          />
        </Slate>
      </div>
    </div>
  );
};




export default MySlateEditor;
