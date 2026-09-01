"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

type ToastType = "success" | "error" | "info";
interface Toast { id: number; type: ToastType; message: string; icon?: "trash"; }

const ToastCtx = createContext<(type: ToastType, message: string, icon?: "trash") => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((type: ToastType, message: string, icon?: "trash") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, message, icon }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  function dismiss(id: number) {
    setToasts((t) => t.filter((x) => x.id !== id));
  }

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.97, transition: { duration: 0.15 } }}
              transition={{ type: "spring", stiffness: 350, damping: 30, duration: 0.2 }}
              className={`toast toast-${t.type}`}
            >
              {t.icon === "trash" && <Trash2 size={18} color="var(--danger)" />}
              {t.icon !== "trash" && t.type === "success" && <CheckCircle2 size={18} color="var(--success)" />}
              {t.icon !== "trash" && t.type === "error" && <AlertCircle size={18} color="var(--danger)" />}
              {t.icon !== "trash" && t.type === "info" && <Info size={18} color="var(--accent)" />}
              <span className="flex-1">{t.message}</span>
              <button className="text-gray-400 hover:text-gray-600" onClick={() => dismiss(t.id)} aria-label="Cerrar">
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}