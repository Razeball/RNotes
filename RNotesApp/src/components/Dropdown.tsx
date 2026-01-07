import { useState } from 'react'

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

    const handleSelect = (value: T) => (event: React.MouseEvent) => {
        event.preventDefault();
        onSelect(value);
        setIsOpen(false);
    };

    return (
        <div style={{ position: 'relative', display: 'inline-block' }}>
            {renderButton(selectedValue, isOpen, () => setIsOpen(!isOpen))}
            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: '10px',
                    backgroundColor: '#00000050',
                    border: '1px solid #000000ff',
                    borderRadius: '4px',
                    boxShadow: '0 2px 4px rgba(255, 255, 255, 0.1)',
                    zIndex: 1000
                }}>
                    {options.map((option, index) => (
                        <div
                            key={index}
                            onMouseDown={handleSelect(option.value)}
                            style={{
                                padding: '8px 16px',
                                cursor: 'pointer',
                                backgroundColor: selectedValue === option.value ? '#0000009f' : '#00000050',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0000009f'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = selectedValue === option.value ? '#0000009f' : '#00000050'}
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
