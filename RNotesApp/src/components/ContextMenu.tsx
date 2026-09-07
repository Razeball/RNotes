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
        backgroundColor: 'var(--rn-bg-float)',
        border: '1px solid var(--rn-line)',
        borderRadius: '7px',
        boxShadow: '0 8px 24px var(--rn-shadow)',
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
              color: 'var(--rn-text)',
              borderRadius: '4px',
              margin: '1px 4px',
              transition: 'background-color 0.08s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--rn-bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            onClick={item.onClick}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span style={{ color: 'var(--rn-text-muted)', fontSize: '11.5px', marginLeft: '28px', flexShrink: 0 }}>
                {item.shortcut}
              </span>
            )}
          </div>
          {item.divider && index < items.length - 1 && (
            <div style={{ height: '1px', backgroundColor: 'var(--rn-line)', margin: '3px 10px' }} />
          )}
        </div>
      ))}
    </div>
  );
};

export default ContextMenu;
