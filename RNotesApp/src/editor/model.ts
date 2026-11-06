import type { BaseEditor, Descendant } from "slate";
import type { ReactEditor } from "slate-react";
import type { HistoryEditor } from "slate-history";
import type { ViewMode } from "../components/Settings";

/**
 * The editor's document model on the TypeScript side: the element and text shapes Slate holds, and
 * the per-tab state built around them.
 *
 * These lived in Editor.tsx, which meant Table.tsx and CheckItem.tsx imported types from the very
 * component that imports them — a cycle. Nothing here imports a component, so nothing can cycle
 * through it. The Rust side of the same contract is `src-tauri/src/document_model.rs`.
 */

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
    | "check"
    | "image"
    | "table"
    | "table-row"
    | "table-cell"
    | "page-spacer";
  children: CustomText[] | CustomElement[];
  alignment?: "start" | "center" | "end" | "justify";
  url?: string;
  size?: ImageSize;
  caption?: string;
  subtitle?: string;
  title?: string;
  id?: string;
  checked?: boolean;
  /** Only used for page-space, never saved */
  height?: number;
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
  fontFamily?: string;
};

export const HEADING_TYPES = new Set<CustomElement["type"]>(["header", "header2", "header3", "header4"]);

declare module "slate" {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor & HistoryEditor;
    Element: CustomElement;
    Text: CustomText;
  }
}

/** A fresh document: one empty paragraph, aligned explicitly so it never inherits the chrome's centring. */
export const initialValue: Descendant[] = [
  {
    type: "paragraph",
    alignment: "start",
    children: [{ text: "" }],
  },
];

export interface DocumentMeta {
  view_mode: 'notepad' | 'document';
  header_enabled: boolean;
  footer_enabled: boolean;
  header_text: string;
  footer_text: string;
}

/** What `open_in_tab` and `open_file_by_path` answer: the nodes, the name, and the view metadata. */
export type LoadedDocument = [Descendant[], string, DocumentMeta];

export interface TabData {
  id: string;
  name: string;
  value: Descendant[];
  changed: boolean;
  key: number;
  viewMode: ViewMode;
  headerEnabled: boolean;
  footerEnabled: boolean;
  headerText: string;
  footerText: string;
}
