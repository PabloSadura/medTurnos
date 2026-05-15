import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '../lib/utils';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              className={cn(
                "pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-lg border min-w-[300px] max-w-md backdrop-blur-sm shadow-black/5",
                toast.type === 'success' && "bg-white/95 dark:bg-surface/95 border-green-100 dark:border-green-900/30",
                toast.type === 'error' && "bg-white/95 dark:bg-surface/95 border-red-100 dark:border-red-900/30",
                toast.type === 'info' && "bg-white/95 dark:bg-surface/95 border-blue-100 dark:border-blue-900/30"
              )}
            >
              <div className={cn(
                "p-1.5 rounded-full shrink-0",
                toast.type === 'success' && "text-green-600 bg-green-50 dark:bg-green-500/10",
                toast.type === 'error' && "text-red-600 bg-red-50 dark:bg-red-500/10",
                toast.type === 'info' && "text-blue-600 bg-blue-50 dark:bg-blue-500/10"
              )}>
                {toast.type === 'success' && <CheckCircle2 size={18} />}
                {toast.type === 'error' && <AlertCircle size={18} />}
                {toast.type === 'info' && <Info size={18} />}
              </div>
              
              <div className="flex-1 pt-1 font-sans">
                <p className="text-xs font-black text-on-surface uppercase tracking-wider leading-tight mb-0.5">
                  {toast.type === 'success' ? 'Éxito' : toast.type === 'error' ? 'Error' : 'Aviso'}
                </p>
                <p className="text-[12px] text-on-surface-variant font-medium leading-relaxed">
                  {toast.message}
                </p>
              </div>

              <button 
                onClick={() => removeToast(toast.id)}
                className="p-1 h-fit hover:bg-surface rounded-lg text-on-surface-variant transition-colors"
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}
