#!/usr/bin/env node
'use strict';

/**
 * UserPromptSubmit hook: suggest up to 3 skills from
 * config/skill-triggers.json based on keyword/regex matches against the
 * prompt (Spanish and English). Suggest-only — it never loads a skill body
 * or blocks the prompt. Budgeted to stay under 50ms; on any error it exits
 * 0 silently so a bad config can never break a prompt.
 *
 * Registered directly in each agent's settings.json (Claude, Command Code),
 * not through ECC's hook-flags/profile system, so it works the same way in
 * every target this fork installs to.
 */

const path = require('path');
const { loadTriggers, matchSkills, formatSuggestion } = require('../../scripts/lib/skill-router');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'skill-triggers.json');
const MIN_PROMPT_LENGTH = 8;
const MAX_PROMPT_BYTES = 8192;

function promptFrom(raw) {
  try {
    const input = JSON.parse(raw);
    return typeof input.prompt === 'string' ? input.prompt : null;
  } catch {
    return null;
  }
}

function main() {
  let raw = '';
  process.stdin.on('data', chunk => (raw += chunk));
  process.stdin.on('end', () => {
    try {
      const prompt = promptFrom(raw);
      if (
        !prompt ||
        prompt.trim().length < MIN_PROMPT_LENGTH ||
        prompt.trimStart().startsWith('/') ||
        Buffer.byteLength(prompt) > MAX_PROMPT_BYTES
      ) {
        return;
      }
      const triggers = loadTriggers(CONFIG_PATH);
      const matches = matchSkills(prompt, triggers);
      const message = formatSuggestion(matches);
      if (message) process.stdout.write(message);
    } catch {
      // Never block a prompt over a router/config problem.
    }
  });
}

if (require.main === module) main();
