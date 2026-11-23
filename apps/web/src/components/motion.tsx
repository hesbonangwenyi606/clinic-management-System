'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export function LoadingState({ label = 'Loading clinic workspace…' }: { label?: string }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <div className="loading-indicator"><span className="motion-spinner" aria-hidden="true" /><span>{label}</span></div>
      <div className="loading-skeleton" aria-hidden="true">
        <span className="skeleton-line" /><span className="skeleton-line short" />
        <div className="skeleton-grid"><span /><span /><span /></div>
      </div>
    </div>
  );
}

export function AnimatedDialog({ title, children, onClose, closeLabel = 'Close record', dismissible = true }: { title: string; children: ReactNode; onClose: () => void; closeLabel?: string; dismissible?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!closing) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timeout = window.setTimeout(() => closeRef.current(), reducedMotion ? 0 : 180);
    return () => window.clearTimeout(timeout);
  }, [closing]);

  return (
    <dialog ref={dialogRef} aria-label={title} className={`panel patient-chart motion-dialog${closing ? ' is-closing' : ''}`}
      onCancel={(event) => { event.preventDefault(); if (dismissible) setClosing(true); }}
      onClick={(event) => { if (dismissible && event.target === event.currentTarget) {
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setClosing(true);
      } }}>
      <button type="button" className="quiet-button dialog-close" disabled={!dismissible} onClick={() => setClosing(true)}>{closeLabel} <span aria-hidden="true">×</span></button>
      {children}
    </dialog>
  );
}
