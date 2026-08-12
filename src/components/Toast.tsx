import { useEffect, useState } from "react";
import { CheckCircle2, Info, X } from "lucide-react";

type ToastKind = "success" | "info";
export type Toast = { id: number; message: string; kind: ToastKind };

let listeners: ((t: Toast) => void)[] = [];
let counter = 0;

export function showToast(message: string, kind: ToastKind = "success") {
  const t = { id: ++counter, message, kind };
  listeners.forEach((l) => l(t));
}

export default function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const l = (t: Toast) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 2600);
    };
    listeners.push(l);
    return () => {
      listeners = listeners.filter((x) => x !== l);
    };
  }, []);

  return (
    <div className="fixed top-3 inset-x-0 z-[60] flex flex-col items-center gap-2 pointer-events-none px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-2xl shadow-lg bg-slate-800 text-white text-sm font-medium animate-slide-down max-w-sm"
        >
          {t.kind === "success" ? (
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          ) : (
            <Info size={18} className="text-sky-400 shrink-0" />
          )}
          <span>{t.message}</span>
          <button
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            className="ml-1 text-slate-400 hover:text-white"
            aria-label="Kapat"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
