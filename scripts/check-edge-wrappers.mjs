#!/usr/bin/env node
/**
 * Static invariant check over every `supabase/functions/<name>/index.ts`
 * Deno wrapper. Fails with a non-zero exit and a per-file message unless
 * every wrapper:
 *   - calls `withSupabase`
 *   - reads `ctx.userClaims`
 *   - writes only via `ctx.supabaseAdmin`
 *   - never reads a player id from the request body (T-02-13)
 *   - never calls `applyMove(` directly (rules must come from `_shared/`)
 *   - stays under 80 lines
 *
 * Discovers function directories rather than hard-coding names, so later
 * plans (02-06, 02-07, ...) can reuse this script unchanged for their own
 * wrappers.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');
const functionsDir = join(repoRoot, 'supabase', 'functions');

const BODY_PLAYER_ID_PATTERN = /body\??\.\s*player_?[Ii]d/;
const MAX_LINES = 80;

function findWrappers() {
    const entries = readdirSync(functionsDir, { withFileTypes: true });
    const wrappers = [];
    for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === '_shared') continue;
        const indexPath = join(functionsDir, entry.name, 'index.ts');
        try {
            if (statSync(indexPath).isFile()) {
                wrappers.push({ name: entry.name, path: indexPath });
            }
        } catch {
            // No index.ts in this directory - not a wrapper, skip.
        }
    }
    return wrappers;
}

function checkWrapper({ path }) {
    const source = readFileSync(path, 'utf8');
    const lineCount = source.split(/\r\n|\n/).length;
    const failures = [];

    if (!source.includes('withSupabase')) failures.push('missing withSupabase(...) call');
    if (!source.includes('userClaims')) failures.push('missing ctx.userClaims check');
    if (!source.includes('ctx.supabaseAdmin')) failures.push('missing ctx.supabaseAdmin usage');
    if (BODY_PLAYER_ID_PATTERN.test(source)) failures.push('reads a player id from the request body');
    if (source.includes('applyMove(')) {
        failures.push('calls applyMove(...) directly - rules must come from _shared/, never inline in a wrapper');
    }
    if (lineCount > MAX_LINES) failures.push(`is ${lineCount} lines - wrappers must stay under ${MAX_LINES}`);

    return failures;
}

const wrappers = findWrappers();
if (wrappers.length === 0) {
    console.error(`No supabase/functions/*/index.ts wrappers found under ${functionsDir}.`);
    process.exit(1);
}

let hasFailures = false;
for (const wrapper of wrappers) {
    const failures = checkWrapper(wrapper);
    if (failures.length === 0) {
        console.log(`PASS ${wrapper.name}`);
    } else {
        hasFailures = true;
        console.error(`FAIL ${wrapper.name}:`);
        for (const failure of failures) {
            console.error(`  - ${failure}`);
        }
    }
}

process.exit(hasFailures ? 1 : 0);
