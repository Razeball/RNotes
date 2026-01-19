import React, { useState, useRef, ReactNode } from 'react';
import '../styles/Popup.css';

interface PopupProps {
  content: ReactNode;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  interactive?: boolean;
}

const Popup: React.FC<PopupProps> = ({ 
  content, 
  children, 
  position = 'top',
  delay = 200,
  interactive = false
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const hideTimeoutRef = useRef<number | null>(null);

  const handleMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (interactive) {
      hideTimeoutRef.current = setTimeout(() => {
        setIsVisible(false);
      }, 100);
    } else {
      setIsVisible(false);
    }
  };

  const handlePopupMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const handlePopupMouseLeave = () => {
    setIsVisible(false);
  };

  return (
    <div 
      className="popup-wrapper"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {isVisible && (
        <div 
          className={`popup-content popup-${position} ${interactive ? 'popup-interactive' : ''}`}
          onMouseEnter={interactive ? handlePopupMouseEnter : undefined}
          onMouseLeave={interactive ? handlePopupMouseLeave : undefined}
        >
          {content}
        </div>
      )}
    </div>
  );
};

export default Popup;
