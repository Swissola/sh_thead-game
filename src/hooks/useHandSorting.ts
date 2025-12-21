import { useState } from 'react';

export type HandSortMode = 'original' | 'rank' | 'suit';

export function useHandSorting(initial: HandSortMode = 'original') {
    const [handSortMode, setHandSortMode] = useState<HandSortMode>(initial);
    return { handSortMode, setHandSortMode };
}
