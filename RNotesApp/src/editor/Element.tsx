import React from "react";
import type { RenderElementProps } from "slate-react";
import ImageElement from "../components/ImageElement";
import { TableElement } from "../components/Table";
import CheckItemElement from "../components/CheckItem";
import { PAGE_SPACER_ATTR } from "../services/pageSpacers";

/** How each block type is drawn. Alignment rides inline, which is what lets it beat the stylesheet. */
export const Element = ({ attributes, children, element }: RenderElementProps) => {
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
    case "page-spacer":
      return (
        <span
          {...attributes}
          {...{ [PAGE_SPACER_ATTR]: 'true' }}
          className="pv-page-spacer"
          style={{ height: `${element.height ?? 0}px` }}
        >
          {children}
        </span>
      );
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
        <td {...attributes} className="rn-table-cell">
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
    case "check":
      return (
        <CheckItemElement attributes={attributes} element={element} style={style}>
          {children}
        </CheckItemElement>
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
