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
});
