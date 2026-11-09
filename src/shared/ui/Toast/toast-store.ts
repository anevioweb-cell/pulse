// A tiny external store for toasts, read with useSyncExternalStore. No state library needed:
// toasts are app-wide, short-lived UI state with one writer API (toast) and one reader (Toaster).

export type ToastVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface ToastOptions {
  /** Main message. */
  title: string;
  /** Optional supporting text. */
  description?: string;
  variant?: ToastVariant;
  /** Auto-dismiss delay in ms. `Infinity` keeps the toast until dismissed. */
  duration?: number;
}

export interface ToastRecord {
  id: string;
  title: string;
  description: string | undefined;
  variant: ToastVariant;
  duration: number;
}

export const DEFAULT_TOAST_DURATION_MS = 5000;
/** Danger toasts stay longer: they usually need reading and action. */
export const DANGER_TOAST_DURATION_MS = 10_000;
/** Oldest toasts are dropped beyond this many, so the stack never covers the page. */
export const MAX_VISIBLE_TOASTS = 4;

type Listener = () => void;

let toasts: readonly ToastRecord[] = [];
const listeners = new Set<Listener>();
let nextId = 0;

function emit(next: readonly ToastRecord[]): void {
  toasts = next;
  for (const listener of listeners) listener();
}

export function subscribeToToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Current toasts, newest last. The array is replaced (never mutated) on every change. */
export function getToasts(): readonly ToastRecord[] {
  return toasts;
}

export function dismissToast(id: string): void {
  if (!toasts.some((item) => item.id === id)) return;
  emit(toasts.filter((item) => item.id !== id));
}

export function dismissAllToasts(): void {
  if (toasts.length > 0) emit([]);
}

function addToast({ title, description, variant = 'neutral', duration }: ToastOptions): string {
  nextId += 1;
  const id = `toast-${String(nextId)}`;
  const record: ToastRecord = {
    id,
    title,
    description,
    variant,
    duration:
      duration ?? (variant === 'danger' ? DANGER_TOAST_DURATION_MS : DEFAULT_TOAST_DURATION_MS),
  };
  emit([...toasts, record].slice(-MAX_VISIBLE_TOASTS));
  return id;
}

type VariantShortcut = (title: string, options?: Omit<ToastOptions, 'title' | 'variant'>) => string;

const shortcut =
  (variant: ToastVariant): VariantShortcut =>
  (title, options) =>
    addToast({ ...options, title, variant });

/**
 * Shows a toast and returns its id. Works anywhere (event handlers, async code); render a single
 * `<Toaster />` near the app root to display them.
 *
 * @example
 * toast({ title: 'Saved' });
 * toast.danger('Device offline', { description: 'ESP32-04 stopped reporting.' });
 */
export const toast = Object.assign(addToast, {
  success: shortcut('success'),
  warning: shortcut('warning'),
  danger: shortcut('danger'),
  info: shortcut('info'),
  dismiss: dismissToast,
  dismissAll: dismissAllToasts,
});
