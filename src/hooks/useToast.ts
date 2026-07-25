import { useState, useCallback, useRef } from 'react';

export interface ToastState {
    message: string;
    code?: string;
}

const DISMISS_MS = 3500;

export function useToast() {
    const [toast, setToast] = useState<ToastState | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const show = useCallback((message: string, code?: string) => {
        if (timerRef.current) clearTimeout(timerRef.current); // D-07: reset the dismiss timer
        setToast({ message, code }); // D-07: replace, not queue
        timerRef.current = setTimeout(() => setToast(null), DISMISS_MS);
    }, []);

    const dismiss = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setToast(null);
    }, []);

    return { toast, show, dismiss };
}
