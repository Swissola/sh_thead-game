# Phase 4: Mobile Packaging (Capacitor) - Context

**Gathered:** 2026-08-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Wrap the existing responsive React web app (Phase 3 delivered the touch/keyboard layer this depends on) in Capacitor to produce an installable native Android app: real app icon and branding replacing the Vite placeholder, a branded splash screen, touch verified inside the native WebView on a real device (not just desktop emulation), and a build a tester can install via the Google Play internal testing track. No new game features, no React Native rewrite (ruled out in PROJECT.md), no separate native UI - Capacitor wraps the same web codebase.

iOS (MOBILE-02, and MOBILE-05's iOS half) is scaffolded but explicitly deferred - the user's dev machine is Windows and iOS builds require Xcode on a Mac, which isn't available. See Decisions below.

</domain>

<decisions>
## Implementation Decisions

### iOS build environment (MOBILE-02, MOBILE-05)
- **D-01:** No Mac available on the user's side. This phase targets Android only for build/test/ship. iOS is deferred to a later pass once a Mac situation (owned, borrowed, or a cloud Mac CI service like Codemagic or a GitHub Actions macOS runner) exists.
- **D-02:** Despite deferring the iOS build, `npx cap add ios` still runs this phase to generate the `ios/` project skeleton. It's never compiled or tested this phase - purely so a future session doesn't have to redo Capacitor setup from scratch, just pick up an already-scaffolded project.
- **D-03:** ROADMAP.md's Phase 4 success criteria (2: "installs and runs on iOS", 5's iOS half) are not achievable this phase given D-01. Planning should treat MOBILE-01/03/04 and MOBILE-05's Android half as this phase's actual completion bar; MOBILE-02 and MOBILE-05's iOS half carry forward as explicitly open until a Mac situation exists. Worth a small ROADMAP.md edit to record this rather than silently under-delivering against the phase's stated success criteria - flag for the user post-planning, not decided unilaterally here.

### App icon, name & splash branding (MOBILE-03)
- **D-04:** New app name for packaging/store identity: **"Shed"** - a non-sweary, simpler name than "SH!THEAD" for what shows on the phone home screen and in the Play Store listing (`capacitor.config.ts`'s `appName`, Android's app label).
- **D-05:** "Shed" is packaging/store identity only. The in-app UI - the pink-to-purple gradient "SH!THEAD" wordmark on the menu screen, `index.html`'s `<title>`, `package.json`'s `name`, README - stays untouched. This phase touches native app metadata and generated icon/splash assets, not existing UI source files.
- **D-06:** Icon design is Claude's discretion within the existing brand colours (pink `#ec4899` → purple `#a855f7` gradient, matching the in-app wordmark/accent treatment) - a simple mark, not shrunk wordmark text (illegible at 48x48px home-screen sizes).
- **D-07:** The icon must be easily themable/regeneratable later - build from a single source SVG plus an icon-generation tool (`@capacitor/assets` is the standard Capacitor-ecosystem choice) rather than hand-exporting fixed PNGs with no source. Changing the icon later should be a one-file edit plus a regenerate command, not manually re-exporting every platform size again.
- **D-08:** Splash screen is a simple static image - the new icon/mark centred on a solid brand colour background, using `@capacitor/splash-screen`'s standard pattern. No animation.

### Developer accounts & real-device testing (MOBILE-04, MOBILE-05)
- **D-09:** Google Play Console account ($25 one-time, per PROJECT.md's already-accepted budget) is **not yet set up** - this is a manual step the user needs to do outside of implementation before MOBILE-05's Play internal testing track can actually happen. Planning should produce a `USER-SETUP.md`-style callout for this rather than assume it's already done.
- **D-10:** A physical Android phone **is** available for testing - MOBILE-04's "real device, not just desktop emulation" requirement can be genuinely satisfied, not just approximated via Android Studio's emulator.

### Native plugin scope
- **D-11:** Capacitor stays a pure WebView wrapper this phase - `@capacitor/android` core plus `@capacitor/splash-screen` and `@capacitor/assets` (icon generation, dev-time only) are the only additions. No `@capacitor/haptics`, no `@capacitor/share`, no other native-feature plugins - those are new capabilities beyond MOBILE-01..05 and would belong in their own future phase if wanted.

### Claude's Discretion
- Exact icon mark/shape (D-06) - simple geometric or card-suit-adjacent mark within brand colours, avoiding literal wordmark text.
- Exact Android app ID / package name (e.g. `com.shed.app` or similar) - implementation detail, not a user decision, though should be chosen once and treated as effectively permanent (Play Store ties listings to package name).
- Precise `@capacitor/assets` source-SVG dimensions/format and where generated platform assets live in the repo (`android/app/src/main/res/` is Capacitor's standard location, not something to relocate).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level context
- `.planning/PROJECT.md` — Core Value, Constraints (Apple $99/yr and Google $25 budget already accepted; Capacitor-wraps-the-web-app decision with its stated rationale), Key Decisions table.
- `.planning/REQUIREMENTS.md` — full MOBILE-01..05 requirement text this phase must satisfy (Android half; MOBILE-02 and MOBILE-05's iOS half deferred per D-01/D-03).
- `.planning/ROADMAP.md` — Phase 4 goal and success criteria; success criteria 2 and half of 5 are not achievable this phase per D-03, flag for a small roadmap edit.

### Phase 3 carry-forward (the responsive/touch layer this phase wraps)
- `.planning/phases/03-responsive-ui/03-CONTEXT.md` — D-09/D-10/D-12 (phone-width layout rearrangement, stock Tailwind breakpoints, one layout for both orientations) and D-13 (44px touch targets) - what MOBILE-04's real-device touch verification is actually checking held up.
- `.planning/phases/03-responsive-ui/03-VALIDATION.md` — current sign-off state: RESP-01/02/03 verified live, RESP-04 partial, RESP-05 (screen reader) explicitly deferred by the user, not yet closed. Not this phase's job to fix, but worth knowing Phase 3 isn't 100% signed off yet when reasoning about what "the responsive layer" has actually proven.

### Source planning documents
- `ROADMAP.md` (repo root) — original staged 7-stage plan; contains implementation-level detail beyond the condensed phase entry.
- `.planning/intel/context.md` — distilled extraction of the above, organized by topic.

No ADRs exist yet for this project — decisions above are the locked record for this phase.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None yet — Capacitor is not installed (`grep -i capacitor package.json` returns nothing today). This phase adds `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` fresh.
- `src/supabase/client.ts` already reads `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` via `import.meta.env` (standard Vite env-var handling, `.env.local` already exists) — a Capacitor-bundled build needs no special backend-connectivity handling, the same built web assets just get wrapped as-is.

### Established Patterns
- `index.html` — still the untouched Vite template: `<link rel="icon" ... href="/vite.svg">`, `<title>sh_thead-game</title>`, viewport meta already present (`width=device-width, initial-scale=1.0`) so no viewport work needed for the WebView.
- `public/` contains only `vite.svg` — no existing icon/asset pipeline to build on; D-07's source-SVG + `@capacitor/assets` approach starts from zero.
- `vite.config.ts` — stock `@vitejs/plugin-react` config, no `build.outDir` customization, no PWA plugin. Capacitor's `webDir` config just points at Vite's default `dist/`.

### Integration Points
- `npx cap init` will need an app name (D-04: "Shed" for the native-facing config) and package ID (Claude's discretion, see above) - these seed `capacitor.config.ts`.
- `npm run build`'s existing `dist/` output is exactly what `npx cap sync` copies into the native `android/` (and later `ios/`) projects — no new build step, just Capacitor's own sync command after the existing build.

</code_context>

<specifics>
## Specific Ideas

"Shed" was the user's own naming choice mid-discussion, not something Claude proposed — a deliberate move away from "SH!THEAD" specifically for what's public-facing (store listing, home screen), while keeping the sweary in-app branding exactly as-is. The "easily themable" requirement (D-07) is a stated maintainability preference, not just a one-off icon request — future icon changes should be cheap.

</specifics>

<deferred>
## Deferred Ideas

- **iOS build (MOBILE-02, MOBILE-05's iOS half)** — deferred to a later phase/pass once a Mac (owned, borrowed, or cloud CI) is available. The `ios/` project is scaffolded this phase (D-02) but not built or tested. Not scope creep — it's existing roadmap scope deferred by a genuine technical constraint, not a new capability.
- **Native plugin additions (haptics, native share sheet)** — raised as options during discussion, explicitly declined for this phase (D-11). Would be their own future phase/task if wanted later.

</deferred>

---

*Phase: 04-mobile-packaging-capacitor*
*Context gathered: 2026-08-05*
