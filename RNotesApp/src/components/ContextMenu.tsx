import React, { useEffect, useRef, useState } from 'react';

export interface ContextMenuItem {
  id: string;
  label: string;
  onClick: () => void;
  divider?: boolean;
  shortcut?: string;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top?: number; bottom?: number; left: number }>({ left: x });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    requestAnimationFrame(() => {
      const menuEl = menuRef.current;
      if (!menuEl) return;
      const menuHeight = menuEl.offsetHeight;
      const windowHeight = window.innerHeight;
      const windowWidth = window.innerWidth;
      const menuWidth = menuEl.offsetWidth;

      let left = x;
      if (left + menuWidth > windowWidth) {
        left = windowWidth - menuWidth - 8;
      }

      if (y + menuHeight > windowHeight - 8) {
        setPosition({ bottom: windowHeight - y, left });
      } else {
        setPosition({ top: y, left });
      }
      setVisible(true);
    });
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: position.top,
        bottom: position.bottom,
        left: position.left,
        backgroundColor: '#2c2c2c',
        border: '1px solid #555',
        borderRadius: '6px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        zIndex: 1000,
        minWidth: '180px',
        padding: '4px 0',
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1)' : 'scale(0.92)',
        transformOrigin: position.bottom !== undefined ? 'bottom left' : 'top left',
        transition: 'opacity 0.15s ease, transform 0.15s ease',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {items.map((item, index) => (
        <div key={item.id}>
          <div
            style={{
              padding: '6px 16px',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '13px',
              color: '#e0e0e0',
              borderRadius: '3px',
              margin: '0 4px',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#3c3c3c'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            onClick={item.onClick}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span style={{ color: '#888', fontSize: '12px', marginLeft: '24px' }}>{item.shortcut}</span>
            )}
          </div>
          {item.divider && index < items.length - 1 && (
            <div style={{ borderBottom: '1px solid #444', margin: '4px 8px' }} />
          )}
        </div>
      ))}
    </div>
  );
};

export default ContextMenu;
