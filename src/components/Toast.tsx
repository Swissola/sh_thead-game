import { CheckCircle2, RotateCcw, X } from 'lucide-react';
import type { ToastState, ToastVariant } from '../hooks/useToast';

const VARIANT_BORDER_CLASS: Record<ToastVariant, string> = {
    error: 'border-red-500',
    reconcile: 'border-amber-500',
    reconnect: 'border-green-500',
};

function VariantIcon({ variant }: { variant: ToastVariant }) {
    if (variant === 'reconcile') return <RotateCcw size={16} className="text-amber-500 shrink-0" />;
    if (variant === 'reconnect') return <CheckCircle2 size={16} className="text-green-500 shrink-0" />;
    return null;
}

export function Toast({ toast, onDismiss }: { toast: ToastState | null; onDismiss: () => void }) {
    if (!toast) return null;

    const variant: ToastVariant = toast.variant ?? 'error';

    return (
        <div
            role="alert"
            aria-live="polite"
            className={`fixed bottom-4 right-4 z-50 max-w-sm bg-slate-800 border-2 ${VARIANT_BORDER_CLASS[variant]} rounded-lg p-4 shadow-2xl flex items-start gap-3`}
        >
            <VariantIcon variant={variant} />
            <p className="text-white text-sm flex-1">{toast.message}</p>
            <button onClick={onDismiss} aria-label="Dismiss" className="text-white/70 hover:text-white">
                <X size={16} />
            </button>
        </div>
    );
}
