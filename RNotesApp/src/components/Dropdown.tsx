import { useState, useRef, useEffect } from 'react'
import '../styles/Dropdown.css'

export type DropdownOption<T> = {
    value: T;
    label: string;
    color?: string; 
}

export type DropdownProps<T> = {
    options: DropdownOption<T>[];
    selectedValue: T;
    onSelect: (value: T) => void;
    renderButton: (selectedValue: T, isOpen: boolean, toggle: () => void) => React.ReactNode;
}

function Dropdown<T>({ options, selectedValue, onSelect, renderButton }: DropdownProps<T>) {
    const [isOpen, setIsOpen] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const handleToggle = () => {
        if (!isOpen) {
            setIsOpen(true);
            setIsAnimating(true);
        } else {
            setIsAnimating(false);
            setTimeout(() => setIsOpen(false), 150);
        }
    };

    const handleSelect = (value: T) => (event: React.MouseEvent) => {
        event.preventDefault();
        onSelect(value);
        setIsAnimating(false);
        setTimeout(() => setIsOpen(false), 150);
    };

    const handleMouseLeave = () => {
        setIsAnimating(false);
        setTimeout(() => setIsOpen(false), 150);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsAnimating(false);
                setTimeout(() => setIsOpen(false), 150);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    return (
        <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
            {renderButton(selectedValue, isOpen, handleToggle)}
            {isOpen && (
                <div 
                    className={`dropdown-menu value-dropdown-menu ${isAnimating ? 'open' : 'closing'}`}
                    onMouseLeave={handleMouseLeave}
                >
                    {options.map((option, index) => (
                        <div
                            key={index}
                            onMouseDown={handleSelect(option.value)}
                            className={`value-dropdown-item ${selectedValue === option.value ? 'selected' : ''}`}
                        >
                            {option.color && (
                                <div style={{
                                    width: '20px',
                                    height: '20px',
                                    backgroundColor: option.color,
                                    border: '1px solid #ccc',
                                    borderRadius: '2px'
                                }}></div>
                            )}
                            <span style={{ textTransform: 'capitalize' }}>{option.label}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default Dropdown
