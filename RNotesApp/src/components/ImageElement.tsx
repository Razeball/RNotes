import { useState } from "react";
import { Transforms } from "slate";
import { ReactEditor, useSlateStatic, RenderElementProps } from "slate-react";
import Popup from "./Popup";
import ContextMenu, { ContextMenuItem } from "./ContextMenu";
import Modal from "./Modal";

export type ImageSize = "small" | "medium" | "large" | "original";

export type CustomElement = {
  type: string;
  children: any[];
  alignment?: "start" | "center" | "end" | "justify";
  url?: string;
  size?: ImageSize;
  caption?: string;
  subtitle?: string;
  title?: string;
};

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
  const [imageContextMenu, setImageContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showCaptionModal, setShowCaptionModal] = useState(false);
  const [showSubtitleModal, setShowSubtitleModal] = useState(false);
  const [showTitleModal, setShowTitleModal] = useState(false);
  const [captionText, setCaptionText] = useState(element.caption || '');
  const [subtitleText, setSubtitleText] = useState(element.subtitle || '');
  const [titleText, setTitleText] = useState(element.title || '');

  const hasAnyText = !!(element.title || element.subtitle || element.caption);
  
  const handleResize = (size: ImageSize) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { size } as Partial<CustomElement>, { at: path });
  };

  const handleAlignment = (alignment: 'start' | 'center' | 'end' | 'justify') => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { alignment } as Partial<CustomElement>, { at: path });
  };

  const handleImageContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setImageContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleCloseImageContextMenu = () => {
    setImageContextMenu(null);
  };

  const applyCaption = () => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { caption: captionText || undefined } as Partial<CustomElement>, { at: path });
    setShowCaptionModal(false);
  };

  const applySubtitle = () => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { subtitle: subtitleText || undefined } as Partial<CustomElement>, { at: path });
    setShowSubtitleModal(false);
  };

  const applyTitle = () => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { title: titleText || undefined } as Partial<CustomElement>, { at: path });
    setShowTitleModal(false);
  };

  const clearAllText = () => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { 
      title: undefined, 
      subtitle: undefined, 
      caption: undefined 
    } as Partial<CustomElement>, { at: path });
    handleCloseImageContextMenu();
  };

  const imageContextMenuItems: ContextMenuItem[] = [
    { id: 'title', label: 'Add Title', onClick: () => { setTitleText(element.title || ''); setShowTitleModal(true); handleCloseImageContextMenu(); }, divider: true },
    { id: 'subtitle', label: 'Add Subtitle', onClick: () => { setSubtitleText(element.subtitle || ''); setShowSubtitleModal(true); handleCloseImageContextMenu(); }, divider: true },
    { id: 'caption', label: 'Add Caption', onClick: () => { setCaptionText(element.caption || ''); setShowCaptionModal(true); handleCloseImageContextMenu(); }, divider: hasAnyText },
    ...(hasAnyText ? [{ id: 'clearAll', label: 'Remove All Text', onClick: clearAllText }] : []),
  ];

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

  const alignmentButtons = (
    <div style={{ display: 'flex', gap: '4px' }}>
      <button 
        className={element.alignment === 'start' || !element.alignment ? 'active' : ''} 
        onClick={() => handleAlignment('start')}
        title="Align left"
      >
        ⬅
      </button>
      <button 
        className={element.alignment === 'center' ? 'active' : ''} 
        onClick={() => handleAlignment('center')}
        title="Center"
      >
        ⬌
      </button>
      <button 
        className={element.alignment === 'end' ? 'active' : ''} 
        onClick={() => handleAlignment('end')}
        title="Align right"
      >
        ➡
      </button>
      <button 
        className={element.alignment === 'justify' ? 'active' : ''} 
        onClick={() => handleAlignment('justify')}
        title="Justify"
      >
        ☰
      </button>
    </div>
  );

  const getAlignmentStyle = (): React.CSSProperties => {
    switch (element.alignment) {
      case 'start': return { textAlign: 'left' };
      case 'center': return { textAlign: 'center' };
      case 'end': return { textAlign: 'right' };
      case 'justify': return { textAlign: 'justify' };
      default: return { textAlign: 'center' };
    }
  };

  return (
    <div {...attributes} style={{...getAlignmentStyle(), margin: "10px 0"}}>
      {element.title && <div style={{ fontWeight: 'bold', fontSize: '18px', marginBottom: '4px' }} contentEditable={false}>{element.title}</div>}
      {element.subtitle && <div style={{ fontStyle: 'italic', fontSize: '14px', color: '#aaa', marginBottom: '8px' }} contentEditable={false}>{element.subtitle}</div>}
      <Popup 
        content={sizeButtons} 
        position="top" 
        delay={200}
        interactive={true}
      >
        <Popup 
          content={alignmentButtons} 
          position="bottom" 
          delay={200}
          interactive={true}
        >
          <img 
            src={element.url} 
            alt="" 
            style={{maxWidth: imageWidth, cursor: 'pointer'}}
            contentEditable={false}
            onContextMenu={handleImageContextMenu}
          />
        </Popup>
      </Popup>
      {element.caption && <div style={{ fontSize: '12px', color: '#888', marginTop: '4px', fontStyle: 'italic' }} contentEditable={false}>{element.caption}</div>}
      {children}
      {imageContextMenu && (
        <ContextMenu
          x={imageContextMenu.x}
          y={imageContextMenu.y}
          items={imageContextMenuItems}
          onClose={handleCloseImageContextMenu}
        />
      )}
      <Modal isOpen={showTitleModal} onClose={() => setShowTitleModal(false)} title="Add Title">
        <input 
          type="text" 
          value={titleText} 
          onChange={e => setTitleText(e.target.value)} 
          placeholder="Image title" 
          style={{ width: '100%', padding: '8px', marginBottom: '10px', backgroundColor: '#1e1e1e', border: '1px solid #444', borderRadius: '4px', color: '#fff' }} 
        />
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={() => setShowTitleModal(false)} style={{ padding: '8px 16px', backgroundColor: '#444', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}>Cancel</button>
          <button onClick={applyTitle} style={{ padding: '8px 16px', backgroundColor: '#4dabf7', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}>Apply</button>
        </div>
      </Modal>
      <Modal isOpen={showSubtitleModal} onClose={() => setShowSubtitleModal(false)} title="Add Subtitle">
        <input 
          type="text" 
          value={subtitleText} 
          onChange={e => setSubtitleText(e.target.value)} 
          placeholder="Image subtitle" 
          style={{ width: '100%', padding: '8px', marginBottom: '10px', backgroundColor: '#1e1e1e', border: '1px solid #444', borderRadius: '4px', color: '#fff' }} 
        />
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={() => setShowSubtitleModal(false)} style={{ padding: '8px 16px', backgroundColor: '#444', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}>Cancel</button>
          <button onClick={applySubtitle} style={{ padding: '8px 16px', backgroundColor: '#4dabf7', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}>Apply</button>
        </div>
      </Modal>
      <Modal isOpen={showCaptionModal} onClose={() => setShowCaptionModal(false)} title="Add Caption">
        <input 
          type="text" 
          value={captionText} 
          onChange={e => setCaptionText(e.target.value)} 
          placeholder="Image caption" 
          style={{ width: '100%', padding: '8px', marginBottom: '10px', backgroundColor: '#1e1e1e', border: '1px solid #444', borderRadius: '4px', color: '#fff' }} 
        />
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={() => setShowCaptionModal(false)} style={{ padding: '8px 16px', backgroundColor: '#444', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}>Cancel</button>
          <button onClick={applyCaption} style={{ padding: '8px 16px', backgroundColor: '#4dabf7', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}>Apply</button>
        </div>
      </Modal>
    </div>
  );
};

export default ImageElement;
