import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type Kind = "good" | "bad" | "info";
interface ToastItem { id: number; text: string; kind: Kind }

const Ctx = createContext<(text: string, kind?: Kind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const push = useCallback((text: string, kind: Kind = "info") => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-2), { id, text, kind }]);
    window.setTimeout(() => dismiss(id), kind === "bad" ? 7000 : 4500);
  }, [dismiss]);

  const value = useMemo(() => push, [push]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((x) => (
          <div key={x.id} className="toast" data-kind={x.kind}>
            <span>{x.text}</span>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(x.id)}>×</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
