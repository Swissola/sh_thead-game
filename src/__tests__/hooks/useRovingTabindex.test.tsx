import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useRovingTabindex } from '../../hooks/useRovingTabindex';

function Harness({ itemCount }: { itemCount: number }) {
    const { containerRef, getItemProps, onKeyDown } = useRovingTabindex(itemCount);

    return (
        <div ref={containerRef} onKeyDown={onKeyDown} data-testid="listbox">
            {Array.from({ length: itemCount }, (_, i) => (
                <button key={i} role="option" {...getItemProps(i)}>
                    Option {i}
                </button>
            ))}
        </div>
    );
}

function getContainer() {
    const el = document.querySelector('[data-testid="listbox"]');
    if (!el) throw new Error('listbox container not found');
    return el as HTMLElement;
}

function getOptions() {
    return Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));
}

describe('useRovingTabindex', () => {
    it('Test 1: ArrowRight on the container moves focus to option index 1', () => {
        render(<Harness itemCount={4} />);
        const container = getContainer();

        fireEvent.keyDown(container, { key: 'ArrowRight' });

        expect(document.activeElement).toBe(getOptions()[1]);
    });

    it('Test 2: ArrowLeft at index 0 leaves focus on option index 0 (no wraparound)', () => {
        render(<Harness itemCount={4} />);
        const container = getContainer();

        fireEvent.keyDown(container, { key: 'ArrowLeft' });

        expect(document.activeElement).toBe(getOptions()[0]);
    });

    it('Test 3: ArrowRight at the last index leaves focus on the last option (no wraparound)', () => {
        render(<Harness itemCount={4} />);
        const container = getContainer();

        fireEvent.keyDown(container, { key: 'ArrowRight' });
        fireEvent.keyDown(container, { key: 'ArrowRight' });
        fireEvent.keyDown(container, { key: 'ArrowRight' });
        fireEvent.keyDown(container, { key: 'ArrowRight' });

        expect(document.activeElement).toBe(getOptions()[3]);
    });

    it('Test 4: End focuses the last option; Home focuses option 0', () => {
        render(<Harness itemCount={4} />);
        const container = getContainer();

        fireEvent.keyDown(container, { key: 'End' });
        expect(document.activeElement).toBe(getOptions()[3]);

        fireEvent.keyDown(container, { key: 'Home' });
        expect(document.activeElement).toBe(getOptions()[0]);
    });

    it('Test 5: ArrowDown behaves as ArrowRight, ArrowUp as ArrowLeft', () => {
        render(<Harness itemCount={4} />);
        const container = getContainer();

        fireEvent.keyDown(container, { key: 'ArrowDown' });
        expect(document.activeElement).toBe(getOptions()[1]);

        fireEvent.keyDown(container, { key: 'ArrowUp' });
        expect(document.activeElement).toBe(getOptions()[0]);
    });

    it('Test 6: exactly one child carries tabIndex === 0 after every keypress', () => {
        render(<Harness itemCount={4} />);
        const container = getContainer();

        fireEvent.keyDown(container, { key: 'ArrowRight' });
        fireEvent.keyDown(container, { key: 'ArrowRight' });

        const zeroTabIndexOptions = getOptions().filter((el) => el.tabIndex === 0);
        expect(zeroTabIndexOptions).toHaveLength(1);
        expect(zeroTabIndexOptions[0]).toBe(getOptions()[2]);
    });

    it('Test 7 (Pitfall 1 regression): shrinking itemCount under the cursor still leaves exactly one tabIndex 0 child, the last remaining one', () => {
        const { rerender } = render(<Harness itemCount={4} />);
        const container = getContainer();

        // Move cursor to index 3.
        fireEvent.keyDown(container, { key: 'End' });
        expect(document.activeElement).toBe(getOptions()[3]);

        // Hand shrinks to 2 items (e.g. cards played) - re-render with itemCount reduced.
        rerender(<Harness itemCount={2} />);

        const zeroTabIndexOptions = getOptions().filter((el) => el.tabIndex === 0);
        expect(zeroTabIndexOptions).toHaveLength(1);
        expect(zeroTabIndexOptions[0]).toBe(getOptions()[1]);
    });

    it('Test 8: an unhandled key does not call preventDefault and does not move focus', () => {
        render(<Harness itemCount={4} />);
        const container = getContainer();

        const event = fireEvent.keyDown(container, { key: 'a' });

        // fireEvent returns false if preventDefault was called on a cancelable event.
        expect(event).toBe(true);
        expect(document.activeElement).not.toBe(getOptions()[1]);
    });
});
