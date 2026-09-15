import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './operator/Icon';
import './toast.css';

/**
 * Toast v2 — one shared toaster for both shells.
 *
 * A FIFO queue of up to 3 visible toasts (not the old single-slot overwrite):
 * success auto-dismisses at 4.2s, error / warning at 6s, and every toast can
 * be dismissed by hand. `desc` renders as a second muted line — the natural
 * home for after-state numbers. Success announces via role="status", the
 * louder kinds via role="alert".
 */

export type ToastKind = 'success' | 'error' | 'warning';

export interface ToastOpts {
  kind?: ToastKind;
  /** second muted line — after-state numbers, server error detail, etc. */
  desc?: string;
}

export type ToastFn = (msg: string, opts?: ToastOpts) => void;

export interface ToastItem {
  id: number;
  msg: string;
  kind: ToastKind;
  desc?: string;
}

/* ---------------- pure queue reducer (unit-tested) ---------------- */

export const TOAST_CAP = 3;

export type ToastAction =
  | { type: 'push'; toast: ToastItem }
  | { type: 'dismiss'; id: number }
  | { type: 'expire'; id: number };

/** Cap 3, FIFO: a push over the cap drops the oldest; dismiss/expire remove by id. */
export function queueReducer(queue: ToastItem[], action: ToastAction): ToastItem[] {
  switch (action.type) {
    case 'push': {
      const next = [...queue, action.toast];
      return next.length > TOAST_CAP ? next.slice(next.length - TOAST_CAP) : next;
    }
    case 'dismiss':
    case 'expire':
      return queue.filter((t) => t.id !== action.id);
    default:
      return queue;
  }
}

/* ---------------- timings ---------------- */

const DUR_SUCCESS = 4200;
const DUR_ALERT = 6000;
// must track `.tv2-toast--out` in toast.css, which is --dur-fast (150ms): an exit is always
// quicker than the 200ms entry — a toast leaving should never ask to be watched
const EXIT_MS = 150;

const MARK: Record<ToastKind, string> = { success: 'check', error: 'close', warning: 'alert' };

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/* ---------------- context + provider ---------------- */

interface ToastsCtxValue {
  toast: ToastFn;
  queue: ToastItem[];
  exiting: readonly number[];
  dismiss: (id: number) => void;
}
const ToastsCtx = createContext<ToastsCtxValue | null>(null);

/** Public API — the extended `toast(msg, opts)` the shells and call sites use. */
export function useToasts(): { toast: ToastFn } {
  const ctx = useContext(ToastsCtx);
  if (!ctx) throw new Error('useToasts outside ToastsProvider');
  return { toast: ctx.toast };
}

export function ToastsProvider({ children }: { children: ReactNode }) {
  const [queue, dispatch] = useReducer(queueReducer, []);
  const [exiting, setExiting] = useState<readonly number[]>([]);
  const idRef = useRef(0);
  const autoTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const exitTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const finalize = useCallback((id: number, reason: 'dismiss' | 'expire') => {
    dispatch({ type: reason, id });
    setExiting((xs) => xs.filter((x) => x !== id));
    exitTimers.current.delete(id);
  }, []);

  const beginExit = useCallback(
    (id: number, reason: 'dismiss' | 'expire') => {
      const auto = autoTimers.current.get(id);
      if (auto) {
        clearTimeout(auto);
        autoTimers.current.delete(id);
      }
      if (exitTimers.current.has(id)) return; // already animating out
      setExiting((xs) => (xs.includes(id) ? xs : [...xs, id]));
      exitTimers.current.set(id, setTimeout(() => finalize(id, reason), reducedMotion() ? 0 : EXIT_MS));
    },
    [finalize],
  );

  const dismiss = useCallback((id: number) => beginExit(id, 'dismiss'), [beginExit]);

  const toast = useCallback<ToastFn>(
    (msg, opts) => {
      const kind = opts?.kind ?? 'success';
      const id = ++idRef.current;
      dispatch({ type: 'push', toast: { id, msg, kind, desc: opts?.desc } });
      const ms = kind === 'success' ? DUR_SUCCESS : DUR_ALERT;
      autoTimers.current.set(id, setTimeout(() => beginExit(id, 'expire'), ms));
    },
    [beginExit],
  );

  useEffect(() => {
    const auto = autoTimers.current;
    const exit = exitTimers.current;
    return () => {
      auto.forEach(clearTimeout);
      exit.forEach(clearTimeout);
    };
  }, []);

  const value = useMemo<ToastsCtxValue>(() => ({ toast, queue, exiting, dismiss }), [toast, queue, exiting, dismiss]);
  return <ToastsCtx.Provider value={value}>{children}</ToastsCtx.Provider>;
}

/* ---------------- viewport ---------------- */

export function ToastViewport() {
  const { t } = useTranslation();
  const ctx = useContext(ToastsCtx);
  if (!ctx || ctx.queue.length === 0) return null;
  return (
    <div className="tv2-viewport">
      {ctx.queue.map((item) => {
        const out = ctx.exiting.includes(item.id);
        return (
          <div
            key={item.id}
            className={`tv2-toast tv2-toast--${item.kind}${out ? ' tv2-toast--out' : ''}`}
            role={item.kind === 'success' ? 'status' : 'alert'}
          >
            <span className="tv2-toast__mark">
              <Icon name={MARK[item.kind]} size={12} strokeWidth={2.5} />
            </span>
            <span className="tv2-toast__body">
              <span className="tv2-toast__msg">{item.msg}</span>
              {item.desc && <span className="tv2-toast__desc">{item.desc}</span>}
            </span>
            <button className="tv2-toast__x" aria-label={t('toastv2.dismiss')} onClick={() => ctx.dismiss(item.id)}>
              <Icon name="close" size={14} strokeWidth={2} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
