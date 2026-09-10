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
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/55 p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-h-[90vh] overflow-auto rounded-[10px] bg-card p-8"
        style={{ maxWidth }}
      >
        {children}
      </div>
    </div>
  );
}
