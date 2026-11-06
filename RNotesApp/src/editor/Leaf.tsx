import React from "react";
import type { RenderLeafProps } from "slate-react";
import Popup from "../components/Popup";

/**
 * How a run of text is drawn: its marks, plus the two decorations — search highlights and spelling
 * squiggles — that are never saved.
 */
export const Leaf = ({ attributes, children, leaf }: RenderLeafProps) => {
  let styledChildren = children;
  if ((leaf as any).searchHighlight) {
    styledChildren = <span style={{ backgroundColor: (leaf as any).activeHighlight ? 'var(--rn-highlight-active)' : 'var(--rn-highlight)' }}>{styledChildren}</span>;
  }
  if ((leaf as any).spell) {
    styledChildren = (
      <span className="rn-spell-error" data-rn-spell={(leaf as any).spell}>{styledChildren}</span>
    );
  }
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
            color: 'var(--rn-accent-text)', 
            textDecoration: isInternalLink ? 'none' : 'underline',
            borderBottom: isInternalLink ? '1px dashed var(--rn-accent-text)' : 'none',
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
    ...(leaf.fontFamily && { fontFamily: leaf.fontFamily }),
  };
  return (
    <span {...attributes} style={style}>
      {styledChildren}
    </span>
  );
};
