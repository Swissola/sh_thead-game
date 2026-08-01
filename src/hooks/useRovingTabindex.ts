import { useRef, useState } from 'react';
import type React from 'react';

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp']);

/**
 * Generic roving-tabindex focus cursor for a fixed-length list of
 * `[role="option"]` descendants inside a container. Moves DOM focus only -
 * never touches selection state, never dispatches. Reusable by any listbox
 * (Hand.tsx's hand, Table.tsx's face-up/face-down piles).
 */
export function useRovingTabindex(itemCount: number) {
    const [rawIndex, setRawIndex] = useState(0);

    // Derived on every render, not stored - a list that shrinks under the
    // cursor (e.g. a played card leaving the hand) must not leave the cursor
    // pointing past the end or leave zero items with tabIndex 0.
    const activeIndex = itemCount === 0 ? -1 : Math.min(Math.max(rawIndex, 0), itemCount - 1);

    const containerRef = useRef<HTMLDivElement | null>(null);

    function getItemProps(index: number) {
        return {
            tabIndex: index === activeIndex ? 0 : -1,
            onFocus: () => setRawIndex(index),
        };
    }

    const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
        let target: number;
        if (NEXT_KEYS.has(event.key)) {
            target = activeIndex + 1;
        } else if (PREV_KEYS.has(event.key)) {
            target = activeIndex - 1;
        } else if (event.key === 'Home') {
            target = 0;
        } else if (event.key === 'End') {
            target = itemCount - 1;
        } else {
            return;
        }

        event.preventDefault();
        const clamped = Math.min(Math.max(target, 0), itemCount - 1);
        setRawIndex(clamped);

        const options = containerRef.current?.querySelectorAll<HTMLElement>('[role="option"]');
        options?.[clamped]?.focus();
    };

    return { containerRef, activeIndex, getItemProps, onKeyDown };
}
