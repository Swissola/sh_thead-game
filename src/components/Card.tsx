import React, { useRef, useState } from 'react';
import type { CardProps } from '../types';

function useCardHoverState(onFocusProp?: (event: React.FocusEvent<HTMLDivElement>) => void) {
    const [hover, setHover] = useState(false);
    const showTimer = useRef<number | null>(null);
    const hideTimer = useRef<number | null>(null);

    const clearShowTimer = () => {
        if (showTimer.current) {
            window.clearTimeout(showTimer.current);
            showTimer.current = null;
        }
    };
    const clearHideTimer = () => {
        if (hideTimer.current) {
            window.clearTimeout(hideTimer.current);
            hideTimer.current = null;
        }
    };

    const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
        clearShowTimer();
        clearHideTimer();
        setHover(true);
        onFocusProp?.(event);
    };
    const onBlur = () => {
        clearShowTimer();
        clearHideTimer();
        setHover(false);
    };
    const onMouseEnter = () => {
        clearHideTimer();
        clearShowTimer();
        showTimer.current = window.setTimeout(() => {
            setHover(true);
            showTimer.current = null;
        }, 250);
    };
    const onMouseLeave = () => {
        clearShowTimer();
        clearHideTimer();
        hideTimer.current = window.setTimeout(() => {
            setHover(false);
            hideTimer.current = null;
        }, 100);
    };

    return { hover, onFocus, onBlur, onMouseEnter, onMouseLeave };
}

function handleActivationKeyDown(event: React.KeyboardEvent<HTMLDivElement>, action: (() => void) | undefined): void {
    if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        action?.();
    }
}

export const Card: React.FC<CardProps> = ({
    card,
    faceDown,
    onClick,
    selectable,
    selected,
    small,
    title,
    role,
    ariaSelected,
    ariaLabel,
    tabIndex,
    onFocus: onFocusProp,
}) => {
    const { hover, onFocus, onBlur, onMouseEnter, onMouseLeave } = useCardHoverState(onFocusProp);
    const isRed = card?.suit === '♥' || card?.suit === '♦';

    const deckColorMap = {
        red: {
            from: 'from-red-600',
            via: 'via-red-700',
            to: 'to-red-800',
            border: 'border-red-900',
            dark: 'rgba(139, 0, 0, 0.4)',
        },
        blue: {
            from: 'from-blue-600',
            via: 'via-blue-700',
            to: 'to-blue-800',
            border: 'border-blue-900',
            dark: 'rgba(0, 0, 139, 0.4)',
        },
        green: {
            from: 'from-green-600',
            via: 'via-green-700',
            to: 'to-green-800',
            border: 'border-green-900',
            dark: 'rgba(0, 100, 0, 0.4)',
        },
        purple: {
            from: 'from-purple-600',
            via: 'via-purple-700',
            to: 'to-purple-800',
            border: 'border-purple-900',
            dark: 'rgba(75, 0, 130, 0.4)',
        },
        orange: {
            from: 'from-orange-600',
            via: 'via-orange-700',
            to: 'to-orange-800',
            border: 'border-orange-900',
            dark: 'rgba(139, 69, 0, 0.4)',
        },
        teal: {
            from: 'from-teal-600',
            via: 'via-teal-700',
            to: 'to-teal-800',
            border: 'border-teal-900',
            dark: 'rgba(0, 100, 100, 0.4)',
        },
    } as const;
    const colorScheme = deckColorMap[card.deckColor as keyof typeof deckColorMap] || deckColorMap.red;

    // Hoisted flat above both branches (rather than as ternaries inline in
    // the JSX below) so each contributes a single, unnested point to this
    // component's cognitive-complexity score instead of a nested one - see
    // S3776 in the SonarQube cleanup pass.
    const ariaSelectedValue = role === 'option' ? ariaSelected : undefined;
    const sizeClass = small ? 'w-16 h-24' : 'w-20 h-32';
    const selectedClass = selected ? 'scale-110 -translate-y-3 ring-4 ring-yellow-400' : '';
    const tooltipMaxWidth = small ? '10rem' : '12rem';
    const tooltipOpacityClass = hover ? 'opacity-100' : 'opacity-0';
    const faceDownSelectableClass = selectable ? 'hover:scale-110 hover:-translate-y-2 shadow-lg' : '';
    const faceUpSelectableClass = selectable ? 'cursor-pointer hover:scale-110 hover:-translate-y-2 shadow-lg' : 'cursor-default';
    const textColorClass = isRed ? 'text-red-600' : 'text-gray-900';
    const rankSizeClass = small ? 'text-xs' : 'text-sm';
    const suitSizeClass = small ? 'text-sm' : 'text-base';
    const centerSuitSizeClass = small ? 'text-2xl' : 'text-3xl';
    const paddingClass = small ? 'p-1' : 'p-2';
    // faceDown always activates on click/Enter/Space regardless of
    // `selectable` (matches this card's original behaviour); the face-up
    // card only activates when selectable.
    let clickAction = onClick;
    if (!faceDown && !selectable) clickAction = undefined;

    if (faceDown) {
        return (
            <div
                role={role}
                aria-selected={ariaSelectedValue}
                aria-label={ariaLabel}
                tabIndex={tabIndex}
                onFocus={onFocus}
                onBlur={onBlur}
                onClick={clickAction}
                onKeyDown={(event) => handleActivationKeyDown(event, clickAction)}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                className={`
          ${sizeClass}
          rounded-lg overflow-hidden
          transition-all cursor-pointer relative
          bg-gradient-to-br ${colorScheme.from} ${colorScheme.via} ${colorScheme.to}
          ${faceDownSelectableClass}
          ${selectedClass}
          focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900
          shadow-md border-2 ${colorScheme.border}
        `}
            >
                {title && (
                    <div
                        className={`absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full z-20 px-2.5 py-1.5 rounded-md text-sm font-semibold text-white bg-black/85 backdrop-blur border border-white/10 shadow-lg transition-opacity duration-150 ${tooltipOpacityClass}`}
                        style={{ pointerEvents: 'none', maxWidth: tooltipMaxWidth }}
                        aria-hidden="true"
                    >
                        {title}
                        <div className="absolute left-1/2 top-full -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-black/85" />
                    </div>
                )}
                <div className="w-full h-full flex items-center justify-center relative p-1">
                    <div
                        className="absolute inset-0"
                        style={{
                            backgroundImage: `
              repeating-linear-gradient(45deg, transparent, transparent 6px, ${colorScheme.dark} 6px, ${colorScheme.dark} 12px),
              repeating-linear-gradient(-45deg, transparent, transparent 6px, ${colorScheme.dark} 6px, ${colorScheme.dark} 12px)
            `,
                        }}
                    ></div>
                    <div
                        className="absolute inset-0"
                        style={{
                            backgroundImage: `radial-gradient(circle at 25% 25%, rgba(255, 255, 255, 0.1) 2px, transparent 2px),
                             radial-gradient(circle at 75% 25%, rgba(255, 255, 255, 0.1) 2px, transparent 2px),
                             radial-gradient(circle at 25% 75%, rgba(255, 255, 255, 0.1) 2px, transparent 2px),
                             radial-gradient(circle at 75% 75%, rgba(255, 255, 255, 0.1) 2px, transparent 2px)`,
                            backgroundSize: '20px 20px',
                        }}
                    ></div>
                    <div className="absolute inset-1 border-2 border-white opacity-50 rounded"></div>
                    <div className="absolute inset-2 border border-white opacity-30 rounded"></div>
                    <div className="relative flex items-center justify-center">
                        <div className="absolute w-8 h-8 border-2 border-white opacity-40 rounded-full"></div>
                        <div className="absolute w-6 h-6 border-2 border-white opacity-40 rounded-full"></div>
                        <div className="absolute w-10 h-1 bg-white opacity-40 rotate-45"></div>
                        <div className="absolute w-10 h-1 bg-white opacity-40 -rotate-45"></div>
                        <div className="absolute w-1 h-10 bg-white opacity-40"></div>
                        <div className="absolute w-10 h-1 bg-white opacity-40"></div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            role={role}
            aria-selected={ariaSelectedValue}
            aria-label={ariaLabel}
            tabIndex={tabIndex}
            onFocus={onFocus}
            onBlur={onBlur}
            onClick={clickAction}
            onKeyDown={(event) => handleActivationKeyDown(event, clickAction)}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            className={`
        ${sizeClass}
        rounded-lg overflow-hidden
        transition-all relative
        bg-white
        ${faceUpSelectableClass}
        ${selectedClass}
        focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900
        shadow-md border-2 border-gray-200
      `}
        >
            {title && (
                <div
                    className={`absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full z-20 px-2.5 py-1.5 rounded-md text-sm font-semibold text-white bg-slate-900/95 backdrop-blur border border-white/10 shadow-lg transition-opacity duration-150 ${tooltipOpacityClass}`}
                    style={{ pointerEvents: 'none', maxWidth: tooltipMaxWidth }}
                    aria-hidden="true"
                >
                    {title}
                    <div className="absolute left-1/2 top-full -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-slate-900/95" />
                </div>
            )}
            <div className={`w-full h-full flex flex-col ${paddingClass}`}>
                <div className={`flex items-start ${textColorClass}`}>
                    <span className={`font-bold leading-none ${rankSizeClass}`}>
                        {card.rank}
                    </span>
                    <span className={`leading-none ml-0.5 ${suitSizeClass}`}>
                        {card.suit}
                    </span>
                </div>

                <div
                    className={`flex-1 flex items-center justify-center ${textColorClass} ${centerSuitSizeClass}`}
                >
                    {card.suit}
                </div>

                <div className={`flex items-end justify-end ${textColorClass}`}>
                    <span className={`leading-none mr-0.5 ${suitSizeClass}`}>
                        {card.suit}
                    </span>
                    <span className={`font-bold leading-none ${rankSizeClass}`}>
                        {card.rank}
                    </span>
                </div>
            </div>
        </div>
    );
};
