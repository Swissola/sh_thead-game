import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

function Harness({ active, onEscape, dismissOnly = false }: { active: boolean; onEscape: () => void; dismissOnly?: boolean }) {
    const containerRef = useFocusTrap(active, onEscape);

    return (
        <div ref={containerRef} data-testid="dialog">
            {dismissOnly ? (
                <button aria-label="Dismiss">X</button>
            ) : (
                <>
                    <button>First</button>
                    <button>Middle</button>
                    <button>Last</button>
                </>
            )}
        </div>
    );
}

describe('useFocusTrap', () => {
    it('Test 1: with active true, focus moves to the first focusable descendant on mount', () => {
        render(<Harness active={true} onEscape={vi.fn()} />);

        expect(document.activeElement).toHaveTextContent('First');
    });

    it('Test 2: Tab while the last focusable element is active moves focus to the first', () => {
        render(<Harness active={true} onEscape={vi.fn()} />);

        const last = document.querySelector('button:last-of-type') as HTMLElement;
        last.focus();
        expect(document.activeElement).toBe(last);

        fireEvent.keyDown(document, { key: 'Tab' });

        expect(document.activeElement).toHaveTextContent('First');
    });

    it('Test 3: Shift+Tab while the first focusable element is active moves focus to the last', () => {
        render(<Harness active={true} onEscape={vi.fn()} />);

        expect(document.activeElement).toHaveTextContent('First');

        fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

        expect(document.activeElement).toHaveTextContent('Last');
    });

    it('Test 4: Escape calls the supplied onEscape callback exactly once', () => {
        const onEscape = vi.fn();
        render(<Harness active={true} onEscape={onEscape} />);

        fireEvent.keyDown(document, { key: 'Escape' });

        expect(onEscape).toHaveBeenCalledTimes(1);
    });

    it('Test 5: unmounting restores focus to the element that was focused before the trap activated', () => {
        const trigger = document.createElement('button');
        trigger.textContent = 'Trigger';
        document.body.appendChild(trigger);
        trigger.focus();
        expect(document.activeElement).toBe(trigger);

        const { unmount } = render(<Harness active={true} onEscape={vi.fn()} />);
        expect(document.activeElement).toHaveTextContent('First');

        unmount();

        expect(document.activeElement).toBe(trigger);
        document.body.removeChild(trigger);
    });

    it('Test 6: with active false, no keydown listener is attached - Escape does not call onEscape', () => {
        const onEscape = vi.fn();
        render(<Harness active={false} onEscape={onEscape} />);

        fireEvent.keyDown(document, { key: 'Escape' });

        expect(onEscape).not.toHaveBeenCalled();
    });

    it('Test 7: a container whose only focusable child is a button with aria-label="Dismiss" receives focus on that button', () => {
        render(<Harness active={true} onEscape={vi.fn()} dismissOnly={true} />);

        expect(document.activeElement).toHaveAttribute('aria-label', 'Dismiss');
    });
});
