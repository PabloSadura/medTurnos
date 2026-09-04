import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { ReactNode } from 'react';
import { cn } from '../lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-2 sm:p-4 cursor-pointer"
          />
          
          {/* Modal Container */}
          <div className="fixed inset-0 z-[101] flex items-center justify-center p-2 sm:p-4 pointer-events-none">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className={cn(
                "bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-hidden pointer-events-auto flex flex-col",
                className
              )}
            >
              <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-outline-variant flex justify-between items-center bg-surface-bright shrink-0 gap-2">
                <h3 className="headline-sm text-on-surface truncate pr-1">{title}</h3>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 hover:bg-surface rounded-full transition-colors text-on-surface-variant shrink-0"
                >
                  <X size={18} />
                </button>
              </div>
              
              <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1 min-w-0">
                {children}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
