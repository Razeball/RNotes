import { useState, useRef, useEffect } from 'react'
import Popup from './Popup'

export type ActionDropdownItem = {
    id: string;
    label: string;
    tooltip?: string;
    shortcut?: string;
    icon?: React.ReactNode;
    disabled?: boolean;
    divider?: boolean;
    submenu?: React.ReactNode;
    onHover?: () => void;
}

export type ActionDropdownProps = {
    items: ActionDropdownItem[];
    onSelect: (id: string) => void;
    renderButton: (isOpen: boolean, toggle: () => void) => React.ReactNode;
    closeOnSelect?: boolean;
}

function ActionDropdown({ items, onSelect, renderButton, closeOnSelect = true }: ActionDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const handleToggle = () => {
        if (!isOpen) {
            setIsOpen(true);
            setIsAnimating(true);
        } else {
            setIsAnimating(false);
            setActiveSubmenu(null);
            setTimeout(() => setIsOpen(false), 150);
        }
    };

    const closeDropdown = () => {
        setIsAnimating(false);
        setActiveSubmenu(null);
        setTimeout(() => setIsOpen(false), 150);
    };

    const handleSelect = (item: ActionDropdownItem) => (event: React.MouseEvent) => {
        event.preventDefault();
        if (item.disabled) return;
        if (item.submenu) return; 
        onSelect(item.id);
        if (closeOnSelect) {
            closeDropdown();
        }
    };

    const handleMouseLeave = () => {
        closeDropdown();
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                closeDropdown();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const renderItemContent = (item: ActionDropdownItem) => {
        const hasSubmenu = !!item.submenu;
        
        const content = (
            <div
                onMouseDown={handleSelect(item)}
                onMouseEnter={(e) => {
                    if (!item.disabled) e.currentTarget.style.backgroundColor = '#333';
                    if (hasSubmenu) {
                        setActiveSubmenu(item.id);
                        item.onHover?.();
                    } else {
                        setActiveSubmenu(null);
                    }
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                }}
                className={`action-dropdown-item ${item.disabled ? 'disabled' : ''}`}
                style={{
                    padding: '8px 16px',
                    cursor: item.disabled ? 'not-allowed' : 'pointer',
                    opacity: item.disabled ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    borderBottom: item.divider ? '1px solid #444' : 'none',
                    position: 'relative',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {item.icon && <span className="action-dropdown-icon">{item.icon}</span>}
                    <span>{item.label}</span>
                </div>
                {item.shortcut && (
                    <span style={{ fontSize: '12px', color: '#888' }}>{item.shortcut}</span>
                )}
                {hasSubmenu && (
                    <span style={{ fontSize: '12px', color: '#888' }}>▶</span>
                )}
            </div>
        );

        const submenuElement = hasSubmenu && activeSubmenu === item.id && (
            <div
                style={{
                    position: 'absolute',
                    left: '100%',
                    top: '0',
                    backgroundColor: 'rgba(0, 0, 0, 0.95)',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                    zIndex: 1002,
                }}
                onMouseEnter={() => setActiveSubmenu(item.id)}
                onMouseLeave={() => setActiveSubmenu(null)}
            >
                {item.submenu}
            </div>
        );

        const wrappedContent = (
            <div key={item.id} style={{ position: 'relative' }}>
                {content}
                {submenuElement}
            </div>
        );

        if (item.tooltip && !hasSubmenu) {
            return (
                <Popup content={item.tooltip} position="right" delay={300} key={item.id}>
                    {wrappedContent}
                </Popup>
            );
        }

        return wrappedContent;
    };

    return (
        <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
            {renderButton(isOpen, handleToggle)}
            {isOpen && (
                <div 
                    className={`action-dropdown-menu ${isAnimating ? 'open' : 'closing'}`}
                    onMouseLeave={handleMouseLeave}
                >
                    {items.map((item) => renderItemContent(item))}
                </div>
            )}
        </div>
    );
}

export default ActionDropdown
