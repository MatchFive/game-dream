import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface ToastValue {
  push: (message: string, kind?: 'error' | 'info') => void;
}

const ToastContext = createContext<ToastValue | null>(null);

interface ToastItem {
  id: number;
  message: string;
  kind: 'error' | 'info';
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Set<number>());

  const push = useCallback((message: string, kind: 'error' | 'info' = 'info') => {
    const id = (seq.current += 1);
    setItems((current) => [...current.slice(-2), { id, message, kind }]);
    const timer = window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
      timers.current.delete(timer);
    }, 3200);
    timers.current.add(timer);
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) window.clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const value = useMemo<ToastValue>(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((item) => (
          <div
            key={item.id}
            className={item.kind === 'error' ? 'toast show toast-error' : 'toast show'}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}
