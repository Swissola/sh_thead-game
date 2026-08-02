import { useEffect, useRef } from 'react';
import type React from 'react';

const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Vanilla Tab/Shift+Tab wrap + Escape + focus-return hook for a portal-rendered
 * modal. No library - matches D-06/D-07's "no new dependency" framing.
 *
 * Note for callers: `onEscape` must be a stable reference (`useCallback` or a
 * module-level function), otherwise this effect re-runs on every render and
 * the trap re-focuses its first element each time.
 */
export function useFocusTrap(active: boolean, onEscape: () => void): React.RefObject<HTMLDivElement | null> {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const previouslyFocused = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!active) return;
        previouslyFocused.current = document.activeElement as HTMLElement | null;

        const container = containerRef.current;
        const getFocusable = () =>
            container ? Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : [];

        getFocusable()[0]?.focus();

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onEscape();
                return;
            }
            if (event.key !== 'Tab') return;

            const focusable = getFocusable();
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable.at(-1) as HTMLElement;

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            previouslyFocused.current?.focus();
        };
    }, [active, onEscape]);

    return containerRef;
}
