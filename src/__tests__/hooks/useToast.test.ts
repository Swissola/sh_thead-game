import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToast } from '../../hooks/useToast';

describe('useToast', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('show() sets the toast when nothing is showing', () => {
        const { result } = renderHook(() => useToast());

        act(() => {
            result.current.show('Wait for your turn', 'NOT_YOUR_TURN');
        });

        expect(result.current.toast).toEqual({ message: 'Wait for your turn', code: 'NOT_YOUR_TURN', variant: 'error' });
    });

    it('show(message) with no code and no variant defaults to variant "error"', () => {
        const { result } = renderHook(() => useToast());

        act(() => {
            result.current.show('Please enter your name');
        });

        expect(result.current.toast).toEqual({ message: 'Please enter your name', code: undefined, variant: 'error' });
    });

    it('show(message, code) - the existing two-argument call shape - still produces variant "error"', () => {
        const { result } = renderHook(() => useToast());

        act(() => {
            result.current.show('Invalid play', 'INVALID_PLAY');
        });

        expect(result.current.toast).toEqual({ message: 'Invalid play', code: 'INVALID_PLAY', variant: 'error' });
    });

    it('show(message, code, "reconcile") produces variant "reconcile"', () => {
        const { result } = renderHook(() => useToast());

        act(() => {
            result.current.show("Your move didn't stick - synced with the latest game state.", undefined, 'reconcile');
        });

        expect(result.current.toast).toEqual({
            message: "Your move didn't stick - synced with the latest game state.",
            code: undefined,
            variant: 'reconcile',
        });
    });

    it('show(message, code, "reconnect") produces variant "reconnect"', () => {
        const { result } = renderHook(() => useToast());

        act(() => {
            result.current.show('Bob reconnected', undefined, 'reconnect');
        });

        expect(result.current.toast).toEqual({ message: 'Bob reconnected', code: undefined, variant: 'reconnect' });
    });

    it('auto-dismisses to null after the dismiss duration elapses with no further show() calls', () => {
        const { result } = renderHook(() => useToast());

        act(() => {
            result.current.show('Wait for your turn');
        });
        expect(result.current.toast).not.toBeNull();

        act(() => {
            vi.advanceTimersByTime(3500);
        });

        expect(result.current.toast).toBeNull();
    });

    it('a second show() while a toast is showing replaces the message/code and resets the dismiss timer (D-07)', () => {
        const { result } = renderHook(() => useToast());

        act(() => {
            result.current.show('First error', 'NOT_YOUR_TURN');
        });

        // Advance partway through the first timer (2000ms of 3500ms).
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        expect(result.current.toast).toEqual({ message: 'First error', code: 'NOT_YOUR_TURN', variant: 'error' });

        // A second show() call replaces the message and restarts the timer.
        act(() => {
            result.current.show('Second error', 'INVALID_PLAY');
        });
        expect(result.current.toast).toEqual({ message: 'Second error', code: 'INVALID_PLAY', variant: 'error' });

        // Advance past the *original* timer's remaining time (1500ms) - if the timer
        // were not reset, the toast would have disappeared by now.
        act(() => {
            vi.advanceTimersByTime(1500);
        });
        expect(result.current.toast).toEqual({ message: 'Second error', code: 'INVALID_PLAY', variant: 'error' });

        // Advance the rest of the new timer's duration (2000ms more, totalling 3500ms
        // since the second show() call) to confirm it does eventually dismiss.
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        expect(result.current.toast).toBeNull();
    });

    it('auto-dismisses a non-default-variant toast after 3500ms, same as the default error variant', () => {
        const { result } = renderHook(() => useToast());

        act(() => {
            result.current.show('Bob reconnected', undefined, 'reconnect');
        });
        expect(result.current.toast).not.toBeNull();

        act(() => {
            vi.advanceTimersByTime(3500);
        });

        expect(result.current.toast).toBeNull();
    });

    it('dismiss() clears the toast immediately and cancels the pending auto-dismiss timer', () => {
        const { result } = renderHook(() => useToast());

        act(() => {
            result.current.show('Wait for your turn');
        });
        expect(result.current.toast).not.toBeNull();

        act(() => {
            result.current.dismiss();
        });
        expect(result.current.toast).toBeNull();

        // Advancing time after dismiss() must not throw or resurrect a toast.
        act(() => {
            vi.advanceTimersByTime(3500);
        });
        expect(result.current.toast).toBeNull();
    });
});
