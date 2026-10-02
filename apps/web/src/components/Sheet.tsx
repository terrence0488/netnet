import { useEffect, useId, useRef, type ReactNode } from 'react';
import styles from './Sheet.module.css';

/** The header's right-hand action, such as Save or Apply. */
export interface SheetAction {
  readonly label: string;
  readonly onAction: () => void;
  /** Shown dimmed and still solid; a tap does nothing (design-system §6.1 rule 9). */
  readonly unavailable?: boolean;
}

export interface SheetProps {
  readonly open: boolean;
  /** Called for the close button, Escape, and a tap outside the sheet. */
  readonly onClose: () => void;
  readonly title: string;
  /** The header's left-hand action, which closes the sheet. */
  readonly closeLabel?: string;
  readonly action?: SheetAction;
  /** Buttons under the body. */
  readonly footer?: ReactNode;
  readonly children: ReactNode;
}

/**
 * A bottom sheet on a phone, a centred dialog on a computer (design-system §6). Built on the
 * platform's modal dialog, so focus, Escape and the inert page behind it are the browser's own.
 */
export function Sheet({
  open,
  onClose,
  title,
  closeLabel = 'Cancel',
  action,
  footer,
  children,
}: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedOutside = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.sheet}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // Only a press that starts and ends on the backdrop closes the sheet: a drag that began
      // inside it (selecting text, say) and ended outside does not.
      onPointerDown={(event) => {
        pressedOutside.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressedOutside.current && event.target === event.currentTarget) onClose();
        pressedOutside.current = false;
      }}
    >
      <div className={styles.inner}>
        <div className={styles.grab} aria-hidden="true" />
        <header className={styles.head}>
          <button type="button" className={styles.headButton} onClick={onClose}>
            {closeLabel}
          </button>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {action ? (
            <button
              type="button"
              className={styles.headButton}
              aria-disabled={action.unavailable ? true : undefined}
              onClick={() => {
                if (!action.unavailable) action.onAction();
              }}
            >
              {action.label}
            </button>
          ) : (
            <span />
          )}
        </header>
        <div className={styles.body}>{children}</div>
        {footer ? <footer className={styles.foot}>{footer}</footer> : null}
      </div>
    </dialog>
  );
}
