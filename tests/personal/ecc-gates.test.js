'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const gate = require('../../hooks/personal/ecc-skill-gate.js');
const spawnGate = require('../../hooks/personal/ecc-spawn-gate.js');
const spec = require('../../personal/bin/ecc-spec');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-gates-'));
}

function transcript(dir, entries) {
  const file = path.join(dir, 't.jsonl');
  fs.writeFileSync(file, entries.map(e => JSON.stringify(e)).join('\n'));
  return file;
}

const user = text => ({ type: 'user', message: { role: 'user', content: text } });
const assistant = text => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });
const toolResult = text => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: text }] } });

test('skill gate: session without tag is untouched', () => {
  const dir = tmpDir();
  const file = transcript(dir, [user('hola'), assistant('listo')]);
  assert.strictEqual(gate.evaluate({ transcript_path: file, session_id: 's1' }, dir), null);
});

test('skill gate: tag only inside a tool_result of an orchestrator is ignored', () => {
  const dir = tmpDir();
  const file = transcript(dir, [user('haz algo'), toolResult('ECC_REQUIRED_SKILLS: a,b'), assistant('ok')]);
  assert.strictEqual(gate.evaluate({ transcript_path: file, session_id: 's2' }, dir), null);
});

test('skill gate: blocks when APPLIED line is missing, then stops after MAX_BLOCKS', () => {
  const dir = tmpDir();
  const file = transcript(dir, [user('x\nECC_REQUIRED_SKILLS: tdd-workflow,python-patterns\ny'), assistant('hecho')]);
  const payload = { transcript_path: file, session_id: 's3' };
  assert.strictEqual(gate.evaluate(payload, dir).decision, 'block');
  assert.strictEqual(gate.evaluate(payload, dir).decision, 'block');
  assert.strictEqual(gate.evaluate(payload, dir), null);
});

test('skill gate: passes when every skill is mentioned on the APPLIED line', () => {
  const dir = tmpDir();
  const file = transcript(dir, [
    user('ECC_REQUIRED_SKILLS: tdd-workflow,python-patterns'),
    assistant('hecho\nECC-SKILLS-APPLIED: tdd-workflow — test primero; python-patterns — tipos')
  ]);
  assert.strictEqual(gate.evaluate({ transcript_path: file, session_id: 's4' }, dir), null);
});

test('skill gate: reports only the skills still missing', () => {
  assert.deepStrictEqual(gate.missingSkills('ECC-SKILLS-APPLIED: a — ok', ['a', 'b']), ['b']);
});

test('skill gate: respects stop_hook_active', () => {
  const dir = tmpDir();
  const file = transcript(dir, [user('ECC_REQUIRED_SKILLS: a'), assistant('hecho')]);
  assert.strictEqual(gate.evaluate({ transcript_path: file, stop_hook_active: true }, dir), null);
});

test('skill gate: uses last_assistant_message when the harness provides it', () => {
  const dir = tmpDir();
  const file = transcript(dir, [user('ECC_REQUIRED_SKILLS: a'), assistant('sin linea')]);
  const payload = { transcript_path: file, session_id: 's5', last_assistant_message: 'ECC-SKILLS-APPLIED: a — ok' };
  assert.strictEqual(gate.evaluate(payload, dir), null);
});

test('spawn gate: denies worker-start --spec without assignment', () => {
  const cmd = 'orca-ide orchestration worker-start --spec "haz algo" --agent claude';
  assert.ok(spawnGate.evaluate({ tool_input: { command: cmd } }));
});

test('spawn gate: allows ecc-spec or explicit tag, and unrelated commands', () => {
  const viaSpec = 'orca-ide orchestration worker-start --spec "$(ecc-spec --skills a --task b)" --agent claude';
  const viaTag = 'orca-ide orchestration worker-start --spec "ECC_REQUIRED_SKILLS: a" --agent claude';
  assert.strictEqual(spawnGate.evaluate({ tool_input: { command: viaSpec } }), null);
  assert.strictEqual(spawnGate.evaluate({ tool_input: { command: viaTag } }), null);
  assert.strictEqual(spawnGate.evaluate({ tool_input: { command: 'ls -la' } }), null);
  assert.strictEqual(spawnGate.evaluate({ tool_input: { command: 'orca-ide orchestration worker-start --task t1 --agent claude' } }), null);
});

test('ecc-spec: embeds skills, tag and closing contract; caps long skills', () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, 'big'));
  fs.writeFileSync(path.join(dir, 'big', 'SKILL.md'), `---\nname: big\n---\n${'x'.repeat(500)}`);
  const out = spec.buildSpec({ skills: ['big'], task: 'tarea', maxChars: 100, auto: false }, dir);
  assert.match(out, /^ECC_REQUIRED_SKILLS: big$/m);
  assert.match(out, /recortada/);
  assert.match(out, /ECC-SKILLS-APPLIED: big/);
  assert.doesNotMatch(out, /name: big/);
});

test('ecc-spec: rejects unknown skills and path traversal', () => {
  const dir = tmpDir();
  assert.throws(() => spec.loadSkill('nope', 100, dir), /no encontrada/);
  assert.throws(() => spec.loadSkill('../etc', 100, dir), /inválido/);
});

test('ecc-spec: the real catalog resolves the routing table and imported skills', () => {
  for (const name of ['tdd-workflow', 'python-patterns', 'react-patterns', 'golang-patterns', 'rust-patterns', 'brainstorming', 'diagnosing-bugs', 'hyperframes']) {
    assert.ok(spec.loadSkill(name, 200).length > 0);
  }
});

test('ecc-spec --auto: picks skills from the task text via skill-triggers.json', () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, 'diagnosing-bugs'));
  fs.writeFileSync(path.join(dir, 'diagnosing-bugs', 'SKILL.md'), '---\nname: diagnosing-bugs\n---\nbody');
  const triggersPath = path.join(dir, 'triggers.json');
  fs.writeFileSync(triggersPath, JSON.stringify({
    triggers: [{ skill: 'diagnosing-bugs', mode: 'suggest', priority: 8, patterns: ['\\bbug\\b'] }]
  }));
  const args = spec.parseArgs(['--auto', '--task', 'tengo un bug al guardar']);
  const out = spec.buildSpec(args, dir, triggersPath);
  assert.match(out, /^ECC_REQUIRED_SKILLS: diagnosing-bugs$/m);
});

test('ecc-spec --auto: throws when nothing matches and no --skills given', () => {
  const dir = tmpDir();
  const triggersPath = path.join(dir, 'triggers.json');
  fs.writeFileSync(triggersPath, JSON.stringify({ triggers: [] }));
  const args = spec.parseArgs(['--auto', '--task', 'algo neutro']);
  assert.throws(() => spec.buildSpec(args, dir, triggersPath), /Falta --skills/);
});

test('ecc-spec: swaps ${CLAUDE_PLUGIN_ROOT}/skills/ for the real skills dir in injected text', () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, 'ui'));
  fs.writeFileSync(path.join(dir, 'ui', 'SKILL.md'), '---\nname: ui\n---\npython "${CLAUDE_PLUGIN_ROOT}/skills/ui/scripts/search.py" x');
  const body = spec.loadSkill('ui', 1000, dir);
  assert.ok(!body.includes('CLAUDE_PLUGIN_ROOT'));
  assert.ok(body.includes(`${dir}/ui/scripts/search.py`));
});

test('ecc-spec: describes the skill directory and its auxiliary resources', () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, 'ui', 'references'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'ui', 'scripts'));
  fs.writeFileSync(path.join(dir, 'ui', 'references', 'a.md'), 'x');
  fs.writeFileSync(path.join(dir, 'ui', 'scripts', 's.py'), 'x');
  fs.writeFileSync(path.join(dir, 'ui', 'SKILL.md'), '---\nname: ui\n---\nbody');
  const line = spec.describeSkillDir('ui', dir);
  assert.match(line, /Directorio: .*\/ui/);
  assert.match(line, /references\/ \(1\)/);
  assert.match(line, /scripts\/ \(1\)/);
  const out = spec.buildSpec({ skills: ['ui'], task: 't', maxChars: 1000, auto: false }, dir);
  assert.match(out, /### Skill: ui\nDirectorio:/);
});
