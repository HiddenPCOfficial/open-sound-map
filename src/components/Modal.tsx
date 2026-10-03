"use client";
import { useEffect, useRef, type ReactNode } from "react";

export function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      aria-describedby="modal-description"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const box = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-header">
        <div>
          <span className="modal-eyebrow">LISTEN TO OPEN STREET MAP</span>
          <h2 id="modal-title">{title}</h2>
          <p id="modal-description">{subtitle}</p>
        </div>
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Chiudi modale"
          autoFocus
        >
          ×
        </button>
      </div>
      <div className="modal-body">{children}</div>
      <div className="modal-footer">
        <span>La tua esperienza, al tuo ritmo.</span>
        <button onClick={onClose}>Fatto ✓</button>
      </div>
    </dialog>
  );
}
