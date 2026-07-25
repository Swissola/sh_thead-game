# Synthesis Summary

Mode: new
Source: C:\Users\marti\sh_thead-game\.planning\intel\classifications\ROADMAP-60c80b3e.json

## Docs by type

- ADR: 0
- SPEC: 0
- PRD: 0
- DOC: 1 — C:\Users\marti\sh_thead-game\ROADMAP.md (confidence: high)
- UNKNOWN: 0

## Decisions locked

0. No ADR-type documents in this ingest. The source ROADMAP.md does contain a
   "Decisions made" table (Supabase for backend, Capacitor for mobile,
   responsive web with no native wrapper for desktop, refactor-first
   sequencing) but it is classified DOC, not ADR, so it is recorded as
   context, not as a locked architectural decision. See
   .planning\intel\context.md, topic "Decisions made (as stated in
   ROADMAP.md)".

## Requirements extracted

0. No PRD-type documents in this ingest. See .planning\intel\requirements.md.

## Constraints

0. No SPEC-type documents in this ingest. See .planning\intel\constraints.md.

## Context topics

6 topics extracted from ROADMAP.md into .planning\intel\context.md:
1. Project framing
2. Codebase audit findings
3. Decisions made (as stated in ROADMAP.md)
4. The throughline (rationale for refactor-first sequencing)
5. Staged plan (Stages 1-7)
6. Sequencing constraints

## Conflicts

0 blockers, 0 competing-variants, 1 auto-resolved/info.
Full report: C:\Users\marti\sh_thead-game\.planning\INGEST-CONFLICTS.md

## Cycle detection

No cross-refs point to other planning documents (cross_refs in the
classification are codebase file paths, not other docs), so no cycle is
possible with a single-doc ingest set. No cycles found.

## Files in this intel set

- C:\Users\marti\sh_thead-game\.planning\intel\decisions.md (empty bucket)
- C:\Users\marti\sh_thead-game\.planning\intel\requirements.md (empty bucket)
- C:\Users\marti\sh_thead-game\.planning\intel\constraints.md (empty bucket)
- C:\Users\marti\sh_thead-game\.planning\intel\context.md (6 topics)
- C:\Users\marti\sh_thead-game\.planning\INGEST-CONFLICTS.md (0 blockers, 0 warnings, 1 info)

Downstream consumer (gsd-roadmapper) should read this file first, then the
per-type intel files above as needed.
