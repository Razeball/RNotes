import { useState, useMemo, useCallback } from "react";
import { createEditor, Descendant, BaseEditor} from "slate";
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

type CustomElement = {
  type:
    | "paragraph"
    | "header"
    | "header2"
    | "header3"
    | "header4"
    | "ulist"
    | "olist"
    | "list-item";
  children: CustomText[];
  alignment?: "start" | "center" | "end" | "justify";
};
type CustomText = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  code?: boolean;
  quote?: boolean;
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

const MySlateEditor = () => {
  const [value, setValue] = useState<Descendant[]>(initialValue);
  const [key, setKey] = useState(0);
  const [documentName, setDocumentName] = useState("Document");
  const editor = useMemo(() => withHistory(withReact(createEditor())), [key]);

  const renderElement = useCallback(
    (props: RenderElementProps) => <Element {...props} />,
    []
  );
  const renderLeaf = useCallback(
    (props: RenderLeafProps) => <Leaf {...props} />,
    []
  );
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
      console.log(loadedName);
      setDocumentName(loadedName);
    } catch (error) {
      alert(`Error opening file: ${error}`);
    }
  }


  return (
    <div>
      <Miscellaneousbar loadDocumentName={getDocumentName} documentName={documentName} editor={editor}>
        <button onClick={save}>Save</button>
        <button onClick={saveAs}>Save As</button>
        <button onClick={open}>Open</button>
   
      </Miscellaneousbar>
      <div
        style={{ border: "1px solid #ccc", padding: "20px", height: "80vh" }}
      >
        <Slate
          key={key}
          editor={editor}
          initialValue={value}
          onChange={(v) => setValue(v)}
        >
          <Toolbar editor={editor} />
          <Editable
            style={{ height: "80%" }}
            renderElement={renderElement}
            renderLeaf={renderLeaf}
            placeholder="Start Writing something..."
          />
        </Slate>
      </div>
    </div>
  );
};

export default MySlateEditor;
