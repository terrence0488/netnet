import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cx } from './cx';
import styles from './Toast.module.css';

export interface ToastAction {
  readonly label: string;
  readonly onAction: () => void;
}

export interface ToastInput {
  readonly message: string;
  /** One follow-up, such as Open or Retry. Choosing it dismisses the toast. */
  readonly action?: ToastAction;
}

interface Shown extends ToastInput {
  readonly id: number;
}

export interface ToastApi {
  readonly show: (toast: ToastInput) => void;
  readonly dismiss: () => void;
}

interface ToastState extends ToastApi {
  readonly current: Shown | null;
}

/** Long enough to read; longer when there is something to do about it. */
const SHOWN_MS = 5_000;
const SHOWN_WITH_ACTION_MS = 8_000;

const ToastContext = createContext<ToastState | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Shown | null>(null);
  const shown = useRef(0);
  const show = useCallback((toast: ToastInput) => {
    shown.current += 1;
    setCurrent({ ...toast, id: shown.current });
  }, []);
  const dismiss = useCallback(() => setCurrent(null), []);
  const value = useMemo(() => ({ current, show, dismiss }), [current, show, dismiss]);
  return <ToastContext value={value}>{children}</ToastContext>;
}

function useToastState(): ToastState {
  const state = use(ToastContext);
  if (!state) throw new Error('useToast needs a ToastProvider above it.');
  return state;
}

/** Say that something happened, briefly, without moving the page. */
export function useToast(): ToastApi {
  const { show, dismiss } = useToastState();
  return useMemo(() => ({ show, dismiss }), [show, dismiss]);
}

/** One toast. Its timer waits while it is hovered or focused. */
function ToastCard({ toast, dismiss }: { toast: Shown; dismiss: () => void }) {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (held) return;
    const timer = setTimeout(dismiss, toast.action ? SHOWN_WITH_ACTION_MS : SHOWN_MS);
    return () => clearTimeout(timer);
  }, [toast, held, dismiss]);

  return (
    <div
      className={styles.toast}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <p className={styles.message}>{toast.message}</p>
      {toast.action ? (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            // Dismissed first, so an action that says something (Opened.) is not dismissed too.
            dismiss();
            toast.action?.onAction();
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Where toasts appear: above the tab bar on a phone, at the bottom on a computer. The live region
 * is always there, so a screen reader hears each message.
 */
export function ToastViewport({ chrome }: { chrome: boolean }) {
  const { current, dismiss } = useToastState();
  return (
    <div
      className={cx(styles.viewport, chrome && styles.withChrome)}
      role="status"
      aria-live="polite"
    >
      {current ? <ToastCard key={current.id} toast={current} dismiss={dismiss} /> : null}
    </div>
  );
}
