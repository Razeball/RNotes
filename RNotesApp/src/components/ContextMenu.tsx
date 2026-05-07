import React, { useEffect, useRef, useState, useCallback } from 'react';

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
  const [isClosing, setIsClosing] = useState(false);

  const openingUpward = position.bottom !== undefined;

  const handleDismiss = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => onClose(), 130);
  }, [onClose]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleDismiss();
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [handleDismiss]);

  useEffect(() => {
    // First RAF: measure and position (invisible)
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
      requestAnimationFrame(() => setVisible(true));
    });
  }, [x, y]);

  const opacity = isClosing ? 0 : visible ? 1 : 0;
  const translateY = isClosing
    ? (openingUpward ? '6px' : '-6px')
    : visible ? '0px' : (openingUpward ? '6px' : '-6px');

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: position.top,
        bottom: position.bottom,
        left: position.left,
        backgroundColor: '#252525',
        border: '1px solid #484848',
        borderRadius: '7px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.55)',
        zIndex: 1000,
        minWidth: '190px',
        padding: '4px 0',
        opacity,
        transform: `translateY(${translateY})`,
        transformOrigin: openingUpward ? 'bottom left' : 'top left',
        transition: 'opacity 0.13s ease, transform 0.13s ease',
        pointerEvents: visible && !isClosing ? 'auto' : 'none',
      }}
    >
      {items.map((item, index) => (
        <div key={item.id}>
          <div
            style={{
              padding: '6px 14px',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              minHeight: '30px',
              fontSize: '13px',
              lineHeight: '1.4',
              color: '#e0e0e0',
              borderRadius: '4px',
              margin: '1px 4px',
              transition: 'background-color 0.08s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#363636')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            onClick={item.onClick}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span style={{ color: '#777', fontSize: '11.5px', marginLeft: '28px', flexShrink: 0 }}>
                {item.shortcut}
              </span>
            )}
          </div>
          {item.divider && index < items.length - 1 && (
            <div style={{ height: '1px', backgroundColor: '#3e3e3e', margin: '3px 10px' }} />
          )}
        </div>
      ))}
    </div>
  );
};

export default ContextMenu;
