'use strict';

// Pure matching logic for the personal skill router. Loads
// config/skill-triggers.json, matches a prompt (Spanish or English) against
// each skill's patterns, and returns the top matches ranked by priority.
// No I/O beyond reading the one config file; kept separate from the hook
// entrypoint (hooks/personal/ecc-skill-router.js) so it is unit-testable.

const fs = require('fs');

const MAX_SUGGESTIONS = 3;

// JS's `\b` only treats ASCII [A-Za-z0-9_] as "word" characters, even with
// the `u` flag — so a pattern ending in an accented letter (bug, pedí,
// depuración) never matches at a real word boundary, because the accented
// letter itself isn't "word" on either side of `\b`. Patterns are plain
// strings (never a literal /\b/ inside a character class here), so it's
// safe to swap every `\b` for this Unicode-aware equivalent before
// compiling: a transition between a Unicode letter/digit/underscore and
// anything else, in either direction.
const UNICODE_BOUNDARY = '(?:(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_])|(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_]))';

function compilePattern(pattern) {
  return new RegExp(pattern.split('\\b').join(UNICODE_BOUNDARY), 'iu');
}

function loadTriggers(configPath) {
  const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return data.triggers.map(entry => ({
    ...entry,
    regexes: entry.patterns.map(compilePattern)
  }));
}

function matchSkills(prompt, triggers, { max = MAX_SUGGESTIONS } = {}) {
  const matches = [];
  for (const entry of triggers) {
    const hit = entry.regexes.find(regex => regex.test(prompt));
    if (hit) matches.push({ skill: entry.skill, kind: entry.kind || 'skill', mode: entry.mode, priority: entry.priority, matchedOn: hit.source });
  }
  matches.sort((a, b) => b.priority - a.priority);
  return matches.slice(0, max);
}

function formatSuggestion(matches) {
  if (matches.length === 0) return '';
  const lines = matches.map(match => {
    const tag = match.mode === 'require' ? ' (recomendada con fuerza)' : '';
    const name = match.kind === 'command' ? `/${match.skill} (comando)` : match.skill;
    return `- ${name}${tag}`;
  });
  return [
    'ECC: skills sugeridas para este prompt (solo sugerencia; ninguna se cargó):',
    ...lines,
    'Para usarla: invoca la Skill por su nombre, o pásala a un worker con `ecc-spec --skills <nombre> --task "..."`.'
  ].join('\n');
}

module.exports = { loadTriggers, matchSkills, formatSuggestion, MAX_SUGGESTIONS };
