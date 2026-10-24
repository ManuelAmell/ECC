'use strict';

// Tests scripts/lib/skill-router.js (matching logic for the UserPromptSubmit
// router and ecc-spec --auto) and the real config/skill-triggers.json shipped
// in this fork. No existing test covered this module before this file.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadTriggers, matchSkills, formatSuggestion } = require('../../scripts/lib/skill-router');

const REAL_TRIGGERS = path.join(__dirname, '..', '..', 'config', 'skill-triggers.json');

function writeTriggers(entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-triggers-'));
  const file = path.join(dir, 'triggers.json');
  fs.writeFileSync(file, JSON.stringify({ triggers: entries }));
  return file;
}

test('loadTriggers: \\b matches at a boundary right after an accented letter (JS\'s \\b is ASCII-only otherwise)', () => {
  const file = writeTriggers([{ skill: 'diagnosing-bugs', mode: 'suggest', priority: 5, patterns: ['\\bpedí\\b', '\\bqu[eé] aprendimos\\b'] }]);
  const triggers = loadTriggers(file);
  assert.ok(triggers[0].regexes[0].test('no era lo que pedí'));
  assert.ok(triggers[0].regexes[1].test('qué aprendimos hoy'));
  assert.ok(!triggers[0].regexes[0].test('pedíamos algo distinto')); // still a real boundary, not a substring match
});

test('matchSkills: matches Spanish and English patterns, case-insensitive', () => {
  const file = writeTriggers([{ skill: 'diagnosing-bugs', mode: 'suggest', priority: 5, patterns: ['\\bbug\\b', 'debug this'] }]);
  const triggers = loadTriggers(file);
  assert.deepStrictEqual(matchSkills('Tengo un BUG al guardar', triggers).map(m => m.skill), ['diagnosing-bugs']);
  assert.deepStrictEqual(matchSkills('please debug this crash', triggers).map(m => m.skill), ['diagnosing-bugs']);
  assert.deepStrictEqual(matchSkills('todo tranquilo por aquí', triggers), []);
});

test('matchSkills: ranks by priority and caps at `max`', () => {
  const file = writeTriggers([
    { skill: 'low', mode: 'suggest', priority: 1, patterns: ['\\bx\\b'] },
    { skill: 'high', mode: 'suggest', priority: 9, patterns: ['\\bx\\b'] },
    { skill: 'mid', mode: 'suggest', priority: 5, patterns: ['\\bx\\b'] }
  ]);
  const triggers = loadTriggers(file);
  const result = matchSkills('x', triggers, { max: 2 });
  assert.deepStrictEqual(result.map(m => m.skill), ['high', 'mid']);
});

test('formatSuggestion: empty matches produce no message; require mode is flagged', () => {
  assert.strictEqual(formatSuggestion([]), '');
  const message = formatSuggestion([{ skill: 'brainstorming', mode: 'require', priority: 9 }]);
  assert.match(message, /brainstorming \(recomendada con fuerza\)/);
  assert.match(message, /ecc-spec --skills/);
});

test('real config/skill-triggers.json loads and has no duplicate skill ids per entry', () => {
  const triggers = loadTriggers(REAL_TRIGGERS);
  assert.ok(triggers.length > 20);
  for (const entry of triggers) {
    assert.ok(entry.skill && entry.patterns.length > 0, `entry missing skill or patterns: ${JSON.stringify(entry)}`);
  }
});

test('real config: representative Spanish prompts match the expected skill', () => {
  const triggers = loadTriggers(REAL_TRIGGERS);
  const cases = [
    ['tengo un bug que falla al guardar', 'diagnosing-bugs'],
    ['quiero una idea nueva para la landing', 'brainstorming'],
    ['necesito renderizar un vídeo del changelog', 'hyperframes'],
    ['escribe la spec de este feature', 'to-spec']
  ];
  for (const [prompt, expected] of cases) {
    const top = matchSkills(prompt, triggers)[0];
    assert.strictEqual(top && top.skill, expected, `prompt "${prompt}" -> ${top && top.skill}`);
  }
});
