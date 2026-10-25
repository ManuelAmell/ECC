'use strict';

// Tests the Orca orchestration layer: preset expansion and wave planning
// (scripts/lib/personal-presets.js), the ecc-spec --preset/--stage/--plan
// CLI paths, and the coordinator reminder hook
// (hooks/personal/ecc-done-reminder.js). No existing test covered these.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const presets = require('../../scripts/lib/personal-presets');
const spec = require('../../personal/bin/ecc-spec');
const reminder = require('../../hooks/personal/ecc-done-reminder');

const ROOT = path.join(__dirname, '..', '..');
const REAL = JSON.parse(fs.readFileSync(path.join(ROOT, 'personal', 'orchestration-presets.json'), 'utf8'));

function fakeData() {
  return {
    maxParallel: 2,
    langSkills: { go: ['golang-patterns'] },
    presets: {
      p: {
        description: 'd',
        stages: [
          { id: 'a', agent: 'claude', worktree: 'current', skills: ['x'], deps: [], readOnly: true },
          { id: 'b', agent: 'claude', worktree: 'new-child', skills: ['y', '{lang}'], deps: [] },
          { id: 'c', agent: 'claude', worktree: 'new-child', skills: ['z'], deps: [] },
          { id: 'vid', agent: 'claude', worktree: 'new-child', skills: ['v'], deps: ['a'], exclusive: true },
          { id: 'end', agent: 'claude', worktree: 'current', skills: ['x'], deps: ['b', 'c', 'vid'] }
        ]
      }
    }
  };
}

test('buildPlan: expands the {lang} token and dedupes skills; unknown preset/lang throw', () => {
  const plan = presets.buildPlan(fakeData(), 'p', { lang: 'go' });
  assert.deepStrictEqual(plan.stages.find(s => s.id === 'b').skills, ['y', 'golang-patterns']);
  assert.deepStrictEqual(presets.buildPlan(fakeData(), 'p').stages.find(s => s.id === 'b').skills, ['y']);
  assert.throws(() => presets.buildPlan(fakeData(), 'nope'), /Preset desconocido/);
  assert.throws(() => presets.buildPlan(fakeData(), 'p', { lang: 'cobol' }), /Lenguaje desconocido/);
});

test('toWaves: respects deps, caps a wave at maxParallel and isolates exclusive stages', () => {
  const waves = presets.toWaves(presets.buildPlan(fakeData(), 'p'));
  // a,b,c are ready; cap 2 -> [a,b]; then c and exclusive vid (deps a done): exclusive goes alone.
  assert.deepStrictEqual(waves[0], ['a', 'b']);
  const flat = waves.flat();
  assert.strictEqual(new Set(flat).size, 5);
  const vidWave = waves.find(w => w.includes('vid'));
  assert.deepStrictEqual(vidWave, ['vid']);
  assert.strictEqual(flat.indexOf('end'), flat.length - 1);
});

test('toWaves: circular or unknown dependencies throw instead of looping', () => {
  const data = fakeData();
  data.presets.p.stages = [{ id: 'a', agent: 'claude', worktree: 'current', skills: ['x'], deps: ['b'] }, { id: 'b', agent: 'claude', worktree: 'current', skills: ['x'], deps: ['a'] }];
  assert.throws(() => presets.toWaves(presets.buildPlan(data, 'p')), /circulares/);
});

test('real presets: every skill exists, deps are valid and every preset can be scheduled', () => {
  const problems = presets.validatePresets(REAL, id => fs.existsSync(path.join(ROOT, 'skills', id)));
  assert.deepStrictEqual(problems, []);
});

test('real presets: the video preset is a single exclusive stage', () => {
  const plan = presets.buildPlan(REAL, 'video');
  assert.strictEqual(plan.stages.length, 1);
  assert.ok(plan.stages[0].exclusive);
  assert.deepStrictEqual(presets.toWaves(plan), [['make']]);
});

test('ecc-spec applyStage: merges stage skills with explicit ones and adds read-only/exclusive notes', () => {
  const args = spec.parseArgs(['--preset', 'feature', '--stage', 'plan', '--skills', 'extra-skill', '--task', 't']);
  const staged = spec.applyStage(args);
  assert.deepStrictEqual(staged.skills, ['extra-skill', 'brainstorming', 'writing-plans']);
  assert.match(staged.notes.join('\n'), /solo lectura/);
  const video = spec.applyStage(spec.parseArgs(['--preset', 'video', '--stage', 'make', '--task', 't']));
  assert.match(video.notes.join('\n'), /exclusiva/);
  assert.throws(() => spec.applyStage(spec.parseArgs(['--preset', 'feature', '--stage', 'nope', '--task', 't'])), /Etapa desconocida/);
});

test('ecc-spec buildSpec: a preset stage injects its skills, notes and previous-stage context', () => {
  const args = spec.parseArgs(['--preset', 'bug', '--stage', 'diagnose', '--task', 'falla al guardar', '--context', 'resumen previo']);
  const out = spec.buildSpec(args);
  assert.match(out, /^ECC_REQUIRED_SKILLS: diagnosing-bugs,systematic-debugging$/m);
  assert.match(out, /Etapa de solo lectura/);
  assert.match(out, /## Contexto de etapas previas\nresumen previo/);
  assert.match(out, /ECC-SKILLS-APPLIED: diagnosing-bugs,systematic-debugging/);
});

test('ecc-spec planWithCommands: every stage gets a worker-start command that goes through ecc-spec', () => {
  const plan = spec.planWithCommands(spec.parseArgs(['--preset', 'feature', '--plan', '--lang', 'django']));
  assert.deepStrictEqual(plan.waves.flat(), ['plan', 'implement', 'review', 'verify']);
  for (const stage of plan.stages) {
    assert.match(stage.command, /^orca-ide orchestration worker-start /);
    assert.match(stage.command, /ecc-spec --preset feature --stage /);
    assert.match(stage.command, /--lang django/);
  }
});

test('reminder: fires on an orchestration check that returned worker_done, with the count', () => {
  const one = reminder.evaluate({
    tool_input: { command: 'orca-ide orchestration check --wait --json' },
    tool_response: { stdout: '{"messages":[{"type":"worker_done"}]}' }
  });
  assert.match(one, /llegó worker_done\./);
  assert.match(one, /ECC-SKILLS-APPLIED/);
  const two = reminder.evaluate({
    tool_input: { command: 'orca-ide orchestration check --json' },
    tool_response: '{"type": "worker_done"} {"type":"worker_done"}'
  });
  assert.match(two, /llegó 2 worker_done\./);
});

test('reminder: silent for other commands, for checks without worker_done and for bad payloads', () => {
  assert.strictEqual(reminder.evaluate({ tool_input: { command: 'ls' }, tool_response: '"type":"worker_done"' }), null);
  assert.strictEqual(reminder.evaluate({ tool_input: { command: 'orca-ide orchestration check' }, tool_response: { stdout: '{"messages":[{"type":"question"}]}' } }), null);
  assert.strictEqual(reminder.evaluate({}), null);
  assert.strictEqual(reminder.evaluate(null), null);
});

test('real skill: ecc-orchestrator exists with a trigger-first description', () => {
  const text = fs.readFileSync(path.join(ROOT, 'skills', 'ecc-orchestrator', 'SKILL.md'), 'utf8');
  assert.match(text, /^name: ecc-orchestrator$/m);
  assert.match(text, /^description: Use when /m);
  assert.ok(os.EOL);
});
