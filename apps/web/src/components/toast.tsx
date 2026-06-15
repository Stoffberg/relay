import { memo, useCallback, useEffect, useState } from "react";

type ToastLevel = "info" | "success" | "warning" | "error";

interface Toast {
  id: number;
  message: string;
  level: ToastLevel;
}

let nextId = 0;
const listeners = new Set<() => void>();
let toasts: Toast[] = [];

function notify() {
  for (const l of listeners) l();
}

export function showToast(message: string, level: ToastLevel = "info") {
  const id = ++nextId;
  toasts = [...toasts, { id, message, level }];
  notify();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  }, 4000);
}

export const ToastContainer = memo(function ToastContainer() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    const cb = () => setItems([...toasts]);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  }, []);

  if (items.length === 0) return null;

  const levelStyles: Record<ToastLevel, string> = {
    info: "border-accent/30 bg-accent-soft text-body",
    success: "border-green-500/30 bg-green-500/5 text-body",
    warning: "border-yellow-500/30 bg-yellow-500/5 text-body",
    error: "border-danger/30 bg-danger-soft text-danger",
  };

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-[360px]"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2 px-3 py-2 rounded-[6px] border text-[12px] font-mono animate-slide-up ${levelStyles[t.level]}`}
        >
          <span className="flex-1">{t.message}</span>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            className="text-dim hover:text-muted shrink-0"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
});
