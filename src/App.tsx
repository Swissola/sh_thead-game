import { useState, useEffect } from 'react';
import { GameProvider, useGameContext } from './context/GameContext';
import { Toast } from './components/Toast';
import { MenuScreen } from './screens/MenuScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { GameScreen } from './screens/GameScreen';
import { ensurePlayerIdentity } from './supabase/session';
import { useRoomSubscription } from './hooks/useRoomSubscription';
import { usePresence } from './hooks/usePresence';

/**
 * D-15: parses a `/join/:code` pathname into its uppercased code segment, or
 * '' for any other path. Pure so it can run inside a `useState` lazy
 * initialiser (parsed exactly once, on mount, per the plan's requirement
 * that later re-renders never re-read the URL).
 */
function parseJoinCode(pathname: string): string {
    const match = pathname.match(/^\/join\/([^/]+)/);
    return match ? decodeURIComponent(match[1]).toUpperCase() : '';
}

/**
 * D-09 orchestrator's router: decides which screen renders based on
 * GameState.phase, and owns the shared chrome (background wrapper, toast
 * container) so it isn't duplicated across Menu/Lobby/Game. Exported as a
 * named export so tests can render it directly inside a test-controlled
 * GameProvider without going through ShitheadGame's own identity bootstrap.
 *
 * Plan 02-10 (MPLAY-02): the old timed-interval localStorage-polling read is
 * gone, replaced by `useRoomSubscription`'s Realtime `postgres_changes`
 * subscription, wired to the context's `applyServerRoom`/`notifyReconciled`
 * seam added by Plan 02-09. `usePresence` is called exactly once here (never
 * inside a screen) so only one Presence channel/heartbeat exists per room.
 */
export function Router({ initialRoomCode = '' }: { initialRoomCode?: string } = {}) {
    const { gameState, testMode, toast, dismissToast, applyServerRoom, notifyReconciled, playerId } =
        useGameContext();

    const roomCode = gameState?.roomCode ?? '';

    useRoomSubscription({
        roomCode,
        testMode,
        localState: gameState,
        onServerRoom: applyServerRoom,
        onReconciled: notifyReconciled,
    });

    // D-10: drives the offline badge on LobbyScreen's player tiles. Not
    // passed to GameScreen yet - that prop signature and its Router call
    // site belong to plan 02-12. usePresence is called here, exactly once
    // (never inside a screen), so only one Presence channel/heartbeat exists
    // per room regardless of which screen is rendered.
    const { isPlayerOffline } = usePresence({ roomCode, playerId, testMode });

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
            {!gameState && <MenuScreen initialRoomCode={initialRoomCode} />}
            {gameState?.phase === 'lobby' && <LobbyScreen isPlayerOffline={isPlayerOffline} />}
            {gameState && gameState.phase !== 'lobby' && <GameScreen />}
            <Toast toast={toast} onDismiss={dismissToast} />
        </div>
    );
}

export default function ShitheadGame() {
    const [playerId, setPlayerId] = useState('');
    const [identityResolved, setIdentityResolved] = useState(false);
    // Lazy initialiser runs exactly once, synchronously, on the first render -
    // satisfies "parsed once on mount; later re-renders do not re-read the URL".
    const [initialRoomCode] = useState(() => parseJoinCode(window.location.pathname));

    // Separate mount-only effect for the URL side-effect (history.replaceState)
    // so a reload doesn't re-seed a stale join code, independent of the parse
    // above which must stay side-effect-free.
    useEffect(() => {
        if (window.location.pathname.startsWith('/join/')) {
            window.history.replaceState(null, '', '/');
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        ensurePlayerIdentity().then((result) => {
            if (cancelled) return;
            // D-02: an unrecoverable session resolves to a null id rather than
            // throwing - fall through to rendering the menu with an empty id
            // so the player still sees the app; the Edge Functions reject an
            // unauthenticated call with a clear error.
            setPlayerId(result.playerId ?? '');
            setIdentityResolved(true);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    if (!identityResolved) {
        // Neutral placeholder inside the existing page-background wrapper,
        // mirroring the "wait for data" `if (!gameState) return null;`
        // convention used across GameScreen/Table, but not a blank document.
        return <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4" />;
    }

    return (
        <GameProvider playerId={playerId}>
            <Router initialRoomCode={initialRoomCode} />
        </GameProvider>
    );
}
