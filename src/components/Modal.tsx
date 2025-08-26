// src/components/Modal.tsx
import React from 'react';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  width?: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export default function Modal({ open, onClose, title, width = 600, children, footer }: ModalProps) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-container"
        style={{ width }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">{title || 'Modal'}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="btn-close"
          >
            ✕
          </button>
        </div>

        <div className="modal-content">{children}</div>

        {footer && (
          <div className="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}