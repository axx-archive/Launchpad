"use client";

import { useEffect, useState, useCallback } from "react";

interface ToastMessage {
  id: string;
  message: string;
  type?: "default" | "success" | "error";
}

let addToastFn: ((message: string, type?: ToastMessage["type"]) => void) | null = null;

export function toast(message: string, type: ToastMessage["type"] = "default") {
  addToastFn?.(message, type);
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback(
    (message: string, type: ToastMessage["type"] = "default") => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  useEffect(() => {
    addToastFn = addToast;
    return () => {
      addToastFn = null;
    };
  }, [addToast]);

  if (toasts.length === 0) return null;

  const borderColor: Record<string, string> = {
    default: "border-border",
    success: "border-success/30",
    error: "border-error/30",
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9500] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-5 py-3 bg-bg-card/95 backdrop-blur-lg border ${borderColor[t.type ?? "default"]} rounded-md shadow-lg animate-[toast-in_0.3s_ease-out]`}
        >
          <p className="font-mono text-[12px] text-text tracking-[0.5px]">
            {t.message}
          </p>
        </div>
      ))}
    </div>
  );
}
