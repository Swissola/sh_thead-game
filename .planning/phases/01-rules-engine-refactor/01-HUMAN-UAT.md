---
status: partial
phase: 01-rules-engine-refactor
source: [01-VERIFICATION.md]
started: 2026-07-25T21:30:00Z
updated: 2026-07-26T13:10:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Celebration modal animation
expected: The celebration modal's bounce/pulse/fade-in animations actually render in the browser once a player finishes or the game ends — not just the modal appearing statically with no motion. Play (or use test mode to reach) a game to a player finish and to full game-over.
result: pass — user confirmed "the modal works but it needs polish" (cosmetic follow-up, not a functional gap; noted for Phase 6).

While testing this, the user found a real fairness bug, unrelated to the animation itself: clicking a face-down card immediately revealed its rank/suit in a "Revealed:" panel before the player committed via the Play button, letting them preview and cherry-pick among all three blind cards. Confirmed pre-existing (identical in pre-refactor commit 02ae1ad, traced further back to commit 9032a4f, 2025-12-21 — well before this phase or any GSD-assisted work). Phase 1's applyMove.ts already enforces blind-play rules correctly (`isBlindPlay` is unconditional for faceDown moves, unlike the original's `&& !revealedFaceDown` bypass) — only the UI-level information leak remained. Fixed (commit 9f4f0fa): removed the pre-commit card-face display and stopped feeding the true card value into the pickUpPile confirmation heuristic (which was itself a side-channel — the dialog's presence/absence would leak whether the hidden card was playable). Position-selection UX is unchanged; only the identity leak is gone. Confirmed working by user.

### 2. Draw-card ghost animation
expected: In the browser, play a hand that triggers a card draw (hand drops below 3 cards with deck.length > 0). Drawn cards animate into the correct hand slots without crashing. Positioning may differ slightly from pre-refactor (accepted tradeoff — the real hand now shows newly-drawn cards immediately rather than waiting for the ghost animation to land).
result: pass — after a fix (commit 21a4653). Initial report: cards flew to a fixed screen point (window centre) instead of the hand. Root cause: GameScreen.tsx's playCards() hardcoded targetPos instead of reading the actual hand-slot DOM position of the played card(s), which the pre-refactor code did via a data-empty-slot query that no longer applies in the new single-shot applyMove model. Fixed by reading each played hand card's position (via its existing data-card-key attribute) before dispatch and using that as the drawn card's landing spot. Confirmed working by user: "they correctly go to the hand."

Separately noted (not a regression, no fix applied): the ghost's animation *origin point* is not actually anchored to the draw pile — confirmed via diff against pre-refactor commit 02ae1ad that this is pre-existing, unchanged behavior (a CSS keyframe with a fixed relative offset, not the computed deckPos). User chose to leave this for Phase 6 (Visual/Gameplay Polish), which already lists "draw-card animation rebuilt... rather than DOM-querying/timing hacks" as an explicit success criterion.

Two more real bugs surfaced during this same UAT session, both fixed and confirmed:

- **Draw-count bug** (commit e3f30b3): playing multiple same-rank cards from hand (e.g. 2x7s from a 3-card hand) only drew 1 replacement card instead of 2, permanently shrinking the hand. `getCardsToDrawCount` drew a flat 1 whenever the hand wasn't fully empty, regardless of how many cards were actually played. Confirmed pre-existing (identical in pre-refactor commit 02ae1ad) but fixed anyway since same-rank multi-plays are a core mechanic and this is the rules-engine phase. New formula: draw enough to refill to 3, capped by deck size.
- **Draw animation regression from the above fix** (commit ab02f0b): fixing the formula exposed a second, separate bug — GameScreen.tsx's cosmetic `cardsToDraw` prediction was calling `getCardsToDrawCount` with the pre-play (still-full) hand instead of the post-play hand, so it now computed "0 cards needed" and the ghost animation stopped appearing entirely for any hand-sourced play. Fixed by nulling out the played hand-card slots before the prediction call, mirroring what `applyMove.ts` already does correctly via `preDrawPlayer`. Confirmed working by user.

Regression tests added (commit 1a547ea) for the draw-count/ghost-count fix and the face-down reveal fix — both verified to genuinely fail against their respective pre-fix commits before being committed.

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
