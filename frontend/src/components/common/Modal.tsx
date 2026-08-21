import type { ReactNode } from 'react';

interface ModalProps {
  onClose: () => void;
  maxWidth?: number;
  children: ReactNode;
}

export function Modal({ onClose, maxWidth = 560, children }: ModalProps) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(16,20,38,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 10,
          maxWidth,
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: 32,
        }}
      >
        {children}
      </div>
    </div>
  );
}
