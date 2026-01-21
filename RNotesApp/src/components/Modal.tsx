import React from 'react';
import '../styles/Modal.css'
export type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
};

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null;

  return (
    <>
      <div
       className='modal-background'
        onClick={onClose}
      />
      <div
        className='modal'
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
