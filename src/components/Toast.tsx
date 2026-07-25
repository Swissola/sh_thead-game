import { X } from 'lucide-react';
import type { ToastState } from '../hooks/useToast';

export function Toast({ toast, onDismiss }: { toast: ToastState | null; onDismiss: () => void }) {
    if (!toast) return null;

    return (
        <div
            role="alert"
            aria-live="polite"
            className="fixed bottom-4 right-4 z-50 max-w-sm bg-slate-800 border-2 border-red-500 rounded-lg p-4 shadow-2xl flex items-start gap-3"
        >
            <p className="text-white text-sm flex-1">{toast.message}</p>
            <button onClick={onDismiss} aria-label="Dismiss" className="text-white/70 hover:text-white">
                <X size={16} />
            </button>
        </div>
    );
}
