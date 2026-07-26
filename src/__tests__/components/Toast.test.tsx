import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toast } from '../../components/Toast';

describe('Toast', () => {
    it('renders the message text and a role="alert" element when toast is populated', () => {
        render(<Toast toast={{ message: 'Wait for your turn' }} onDismiss={vi.fn()} />);

        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Wait for your turn')).toBeInTheDocument();
    });

    it('renders nothing when toast is null', () => {
        render(<Toast toast={null} onDismiss={vi.fn()} />);

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('calls onDismiss exactly once when the dismiss button is clicked', () => {
        const onDismiss = vi.fn();
        render(<Toast toast={{ message: 'Wait for your turn' }} onDismiss={onDismiss} />);

        fireEvent.click(screen.getByRole('button'));

        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('renders border-red-500 for variant "error" (and when variant is omitted)', () => {
        const { container } = render(<Toast toast={{ message: 'Invalid play', variant: 'error' }} onDismiss={vi.fn()} />);

        expect(container.querySelector('.border-red-500')).toBeInTheDocument();
    });

    it('renders border-amber-500 for variant "reconcile"', () => {
        const { container } = render(
            <Toast
                toast={{ message: "Your move didn't stick - synced with the latest game state.", variant: 'reconcile' }}
                onDismiss={vi.fn()}
            />
        );

        expect(container.querySelector('.border-amber-500')).toBeInTheDocument();
    });

    it('renders border-green-500 for variant "reconnect"', () => {
        const { container } = render(<Toast toast={{ message: 'Bob reconnected', variant: 'reconnect' }} onDismiss={vi.fn()} />);

        expect(container.querySelector('.border-green-500')).toBeInTheDocument();
    });

    it('exposes role="alert" and aria-label="Dismiss" for every variant', () => {
        (['error', 'reconcile', 'reconnect'] as const).forEach((variant) => {
            const { unmount } = render(<Toast toast={{ message: 'Some message', variant }} onDismiss={vi.fn()} />);

            expect(screen.getByRole('alert')).toBeInTheDocument();
            expect(screen.getByLabelText('Dismiss')).toBeInTheDocument();
            unmount();
        });
    });
});
