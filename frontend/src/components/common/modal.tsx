import type { ReactNode } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface ModalProps {
  onClose: () => void;
  maxWidth?: number;
  children: ReactNode;
}

export function Modal({ onClose, maxWidth = 560, children }: ModalProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-label="Janela de diálogo"
        showCloseButton={false}
        className="max-h-[90vh] w-full overflow-auto rounded-[10px] bg-card p-8"
        style={{ maxWidth }}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}
