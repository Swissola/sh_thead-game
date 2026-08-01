import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Card } from '../../components/Card';
import { buildCard } from '../testUtils/buildGameState';

describe('Card', () => {
    it('renders role="option" and tabindex="0" on a face-up Card given those props', () => {
        const card = buildCard();
        const { container } = render(<Card card={card} role="option" tabIndex={0} />);

        const outer = container.firstElementChild as HTMLElement;
        expect(outer).toHaveAttribute('role', 'option');
        expect(outer).toHaveAttribute('tabindex', '0');
    });

    it('calls onClick exactly once when Enter is pressed on a selectable, focused face-up Card with role="option"', () => {
        const card = buildCard();
        const onClick = vi.fn();
        const { container } = render(
            <Card card={card} role="option" tabIndex={0} selectable onClick={onClick} />
        );

        const outer = container.firstElementChild as HTMLElement;
        fireEvent.keyDown(outer, { key: 'Enter' });

        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('calls onClick exactly once when Space is pressed on a selectable, focused face-up Card with role="option"', () => {
        const card = buildCard();
        const onClick = vi.fn();
        const { container } = render(
            <Card card={card} role="option" tabIndex={0} selectable onClick={onClick} />
        );

        const outer = container.firstElementChild as HTMLElement;
        fireEvent.keyDown(outer, { key: ' ' });

        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('does not call onClick on Enter or Space when selectable is false, mirroring the mouse-path gating', () => {
        const card = buildCard();
        const onClick = vi.fn();
        const { container } = render(
            <Card card={card} role="option" tabIndex={0} selectable={false} onClick={onClick} />
        );

        const outer = container.firstElementChild as HTMLElement;
        fireEvent.keyDown(outer, { key: 'Enter' });
        fireEvent.keyDown(outer, { key: ' ' });

        expect(onClick).not.toHaveBeenCalled();
    });

    it('calls onClick on Enter and Space for a face-down Card with role="option" (unconditional onClick gating)', () => {
        const card = buildCard();
        const onClick = vi.fn();
        const { container } = render(
            <Card card={card} faceDown role="option" tabIndex={0} onClick={onClick} />
        );

        const outer = container.firstElementChild as HTMLElement;
        fireEvent.keyDown(outer, { key: 'Enter' });
        fireEvent.keyDown(outer, { key: ' ' });

        expect(onClick).toHaveBeenCalledTimes(2);
    });

    it('has no aria-selected attribute at all when rendered without a role prop', () => {
        const card = buildCard();
        const { container } = render(<Card card={card} ariaSelected={true} />);

        const outer = container.firstElementChild as HTMLElement;
        expect(outer).not.toHaveAttribute('aria-selected');
    });

    it('renders aria-selected="true"/"false" from ariaSelected when role="option"', () => {
        const card = buildCard();
        const { container: trueContainer } = render(
            <Card card={card} role="option" ariaSelected={true} />
        );
        const { container: falseContainer } = render(
            <Card card={card} role="option" ariaSelected={false} />
        );

        expect(trueContainer.firstElementChild as HTMLElement).toHaveAttribute('aria-selected', 'true');
        expect(falseContainer.firstElementChild as HTMLElement).toHaveAttribute('aria-selected', 'false');
    });

    it('does not call onClick and does not call preventDefault when ArrowRight is pressed, so arrows keep bubbling', () => {
        const card = buildCard();
        const onClick = vi.fn();
        const { container } = render(
            <Card card={card} role="option" tabIndex={0} selectable onClick={onClick} />
        );

        const outer = container.firstElementChild as HTMLElement;
        const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
        outer.dispatchEvent(event);

        expect(onClick).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    it('never leaks a face-down card identity: outerHTML contains neither the rank nor the suit', () => {
        const card = buildCard({ rank: 'K', suit: '♥' });
        const { container } = render(
            <Card card={card} faceDown ariaLabel="Face-down card" />
        );

        const outer = container.firstElementChild as HTMLElement;
        expect(outer).toHaveAccessibleName('Face-down card');
        expect(outer.outerHTML).not.toContain('K');
        expect(outer.outerHTML).not.toContain('♥');
    });
});
