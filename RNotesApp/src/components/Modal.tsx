import React from 'react';
import '../styles/Modal.css'
export type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export default function Modal({ isOpen, onClose, title, children, className = '' }: ModalProps) {
  if (!isOpen) return null;

  return (
    <>
      <div
       className='modal-background'
        onClick={onClose}
      />
      <div
        className={`modal ${className}`.trim()}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0, marginBottom: '15px', fontSize: '16px' }}>
          {title}
        </h3>
        {children}
      </div>
    </>
  );
}
