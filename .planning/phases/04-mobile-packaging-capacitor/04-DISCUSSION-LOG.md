# Phase 4: Mobile Packaging (Capacitor) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-05
**Phase:** 4-mobile-packaging-capacitor
**Areas discussed:** iOS build environment, App icon/name & splash branding, Developer accounts & real-device testing, Native plugin scope

---

## iOS build environment

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, I have a Mac available | Local Xcode builds and TestFlight uploads work the normal way | |
| No Mac, but I'll use a cloud Mac CI service | Codemagic/GitHub Actions macOS runner, builds/signs remotely | |
| No Mac - do Android first, defer iOS | Ship Android now, iOS becomes a later pass | ✓ |

**User's choice:** No Mac - do Android first, defer iOS.

| Option | Description | Selected |
|--------|-------------|----------|
| Scaffold it now, don't build it | `npx cap add ios` generates the skeleton, never compiled this phase | ✓ |
| Skip iOS entirely this phase | Only touch `android/`, add `ios/` as its own task later | |

**User's choice:** Scaffold it now, don't build it.
**Notes:** User's dev machine is Windows 11 (confirmed via environment info) — hard technical constraint, not a preference. This reshapes the phase's actual achievable success criteria; flagged as a ROADMAP.md note-worthy item in CONTEXT.md's D-03, not silently absorbed.

---

## App icon, name & splash branding

| Option | Description | Selected |
|--------|-------------|----------|
| The in-app wordmark (pink-to-purple gradient 'SH!THEAD') | Reuse existing gradient treatment | |
| Something new - I'll describe or provide it | Dedicated icon design | |
| You decide | Claude's discretion within brand colours | (see notes) |

**User's choice (free text):** "Going with the simpler, non sweary, name Shed. Claude's discretion with existing colours, but make it easily themable or changeable for the future."
**Notes:** Introduced a new name ("Shed") not present in any prior option — captured as D-04/D-06/D-07 in CONTEXT.md rather than shoehorned into one of the three presented options.

| Option | Description | Selected |
|--------|-------------|----------|
| Packaging/store identity only | Home-screen label, store listing, native metadata become "Shed"; in-app UI keeps "SH!THEAD" | ✓ |
| Rename everywhere, including in-app UI | Cross-cutting rename touching MenuScreen.tsx, index.html, README, package.json | |

**User's choice:** Packaging/store identity only.

| Option | Description | Selected |
|--------|-------------|----------|
| Simple - logo centred on a solid brand colour | Standard Capacitor splash-screen pattern, static image | ✓ |
| Skip a custom splash - use Capacitor's default | Plain system splash, no branding | |

**User's choice:** Simple - logo centred on a solid brand colour.

---

## Developer accounts & real-device testing

| Option | Description | Selected |
|--------|-------------|----------|
| Already have one (Play Console) | Can go straight to internal testing track setup | |
| Need to set it up | Manual account creation + $25 fee before MOBILE-05 can happen | ✓ |

**User's choice:** Need to set it up.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, I have a physical Android phone | MOBILE-04's real-device requirement genuinely satisfiable | ✓ |
| Emulator only for now | Would need a real device before final sign-off | |

**User's choice:** Yes, I have a physical Android phone.

---

## Native plugin scope

| Option | Description | Selected |
|--------|-------------|----------|
| Pure WebView wrapper only | Just MOBILE-01..05, no extra native plugins beyond splash-screen | ✓ |
| Add haptic feedback on card play | @capacitor/haptics, new capability beyond stated requirements | |
| Add native share sheet for room codes | @capacitor/share, new capability beyond stated requirements | |

**User's choice:** Pure WebView wrapper only.

---

## Claude's Discretion

- Exact icon mark/shape within existing brand colours (pink `#ec4899` → purple `#a855f7`), avoiding shrunk wordmark text
- Android app ID / package name
- `@capacitor/assets` source-SVG format and generated-asset file locations (Capacitor's standard `android/app/src/main/res/` layout, not relocated)

## Deferred Ideas

- iOS build (MOBILE-02, MOBILE-05's iOS half) — later phase/pass once a Mac situation exists; `ios/` scaffolded but not built this phase
- Native plugin additions (haptics, native share) — explicitly declined for this phase, could be a future phase/task
