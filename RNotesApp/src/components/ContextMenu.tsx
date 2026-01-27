import React, { useEffect } from 'react';

export interface ContextMenuItem {
  id: string;
  label: string;
  onClick: () => void;
  divider?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  useEffect(() => {
    const handleClickOutside = () => {
      onClose();
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        top: y,
        left: x,
        backgroundColor: '#2c2c2c',
        border: '1px solid #555',
        borderRadius: '4px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        zIndex: 1000,
        minWidth: '150px',
      }}
    >
      {items.map((item, index) => (
        <div key={item.id}>
          <div
            style={{
              padding: '8px 16px',
              cursor: 'pointer',
              ...(item.divider && index < items.length - 1 ? { borderBottom: '1px solid #555' } : {}),
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#3c3c3c'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            onClick={item.onClick}
          >
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ContextMenu;
