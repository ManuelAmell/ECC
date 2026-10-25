'use strict';

// Tests scripts/lib/personal-install.js in a throwaway HOME: creation,
// idempotency, dry-run, conflict handling and missing agents. No existing
// test covered this module.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { installAll } = require('../../scripts/lib/personal-install');

const REPO = path.join(__dirname, '..', '..');

function fakeHome({ claude = true, opencode = true, gemini = true, commandcode = true } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-install-home-'));
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(home, rel)), { recursive: true });
    fs.writeFileSync(path.join(home, rel), text);
  };
  if (claude) write('.claude/settings.json', JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo existing' }] }] }, theme: 'dark' }));
  if (opencode) fs.mkdirSync(path.join(home, '.config/opencode'), { recursive: true });
  if (gemini) fs.mkdirSync(path.join(home, '.gemini'), { recursive: true });
  if (commandcode) write('.commandcode/settings.json', JSON.stringify({ hooks: {} }));
  return home;
}

const statuses = actions => actions.map(action => action.status);

test('installAll: creates aliases, instruction links, import line and hooks; keeps existing settings', () => {
  const home = fakeHome();
  const actions = installAll({ home, repoRoot: REPO });
  assert.ok(!statuses(actions).includes('conflict'));
  assert.strictEqual(fs.readlinkSync(path.join(home, '.ecc-shared/repo')), REPO);
  assert.strictEqual(fs.readlinkSync(path.join(home, '.config/opencode/AGENTS.md')), path.join(home, '.ecc-shared/ECC.md'));
  assert.ok(fs.existsSync(path.join(home, '.gemini/GEMINI.md')));
  assert.match(fs.readFileSync(path.join(home, '.claude/CLAUDE.md'), 'utf8'), /^@~\/\.ecc-shared\/ECC\.md$/m);

  const claude = JSON.parse(fs.readFileSync(path.join(home, '.claude/settings.json'), 'utf8'));
  assert.strictEqual(claude.theme, 'dark');
  assert.ok(claude.hooks.Stop.some(g => g.hooks.some(h => h.command === 'echo existing')));
  for (const [event, script] of [['PreToolUse', 'ecc-spawn-gate'], ['Stop', 'ecc-skill-gate'], ['UserPromptSubmit', 'ecc-skill-router'], ['PostToolUse', 'ecc-done-reminder']]) {
    assert.ok(claude.hooks[event].some(g => g.hooks.some(h => h.command.includes(script))), `${event} ${script}`);
  }
  const cmdc = JSON.parse(fs.readFileSync(path.join(home, '.commandcode/settings.json'), 'utf8'));
  assert.ok(cmdc.hooks.Stop.some(g => g.hooks.some(h => h.command.includes('ecc-skill-gate'))));
  assert.ok(fs.readdirSync(path.join(home, '.ecc-shared/backups')).length >= 1);
});

test('installAll: a second run changes nothing', () => {
  const home = fakeHome();
  installAll({ home, repoRoot: REPO });
  const before = fs.readFileSync(path.join(home, '.claude/settings.json'), 'utf8');
  const second = installAll({ home, repoRoot: REPO });
  assert.ok(second.every(action => ['ok', 'not-installed'].includes(action.status)), JSON.stringify(statuses(second)));
  assert.strictEqual(fs.readFileSync(path.join(home, '.claude/settings.json'), 'utf8'), before);
});

test('installAll --dry-run: reports what it would do and writes nothing', () => {
  const home = fakeHome();
  const before = fs.readFileSync(path.join(home, '.claude/settings.json'), 'utf8');
  const actions = installAll({ home, repoRoot: REPO, dryRun: true });
  assert.ok(statuses(actions).includes('created'));
  assert.ok(!fs.existsSync(path.join(home, '.ecc-shared')));
  assert.ok(!fs.existsSync(path.join(home, '.claude/CLAUDE.md')));
  assert.strictEqual(fs.readFileSync(path.join(home, '.claude/settings.json'), 'utf8'), before);
});

test('installAll: never overwrites an existing real file or a foreign link (reports conflict)', () => {
  const home = fakeHome();
  fs.writeFileSync(path.join(home, '.config/opencode/AGENTS.md'), 'mine');
  fs.symlinkSync('/etc/hostname', path.join(home, '.gemini/GEMINI.md'));
  const actions = installAll({ home, repoRoot: REPO });
  const conflicts = actions.filter(action => action.status === 'conflict').map(action => path.basename(action.path));
  assert.deepStrictEqual(conflicts.sort(), ['AGENTS.md', 'GEMINI.md']);
  assert.strictEqual(fs.readFileSync(path.join(home, '.config/opencode/AGENTS.md'), 'utf8'), 'mine');
  assert.strictEqual(fs.readlinkSync(path.join(home, '.gemini/GEMINI.md')), '/etc/hostname');
});

test('installAll: agents that are not installed are skipped, not created', () => {
  const home = fakeHome({ claude: false, opencode: false, gemini: false, commandcode: false });
  const actions = installAll({ home, repoRoot: REPO });
  assert.strictEqual(actions.filter(action => action.status === 'not-installed').length, 4);
  assert.ok(!fs.existsSync(path.join(home, '.claude')));
  assert.ok(!fs.existsSync(path.join(home, '.commandcode')));
});

test('installAll: --agents limits what is touched', () => {
  const home = fakeHome();
  installAll({ home, repoRoot: REPO, agents: ['opencode'] });
  assert.ok(fs.existsSync(path.join(home, '.config/opencode/AGENTS.md')));
  assert.ok(!fs.existsSync(path.join(home, '.gemini/GEMINI.md')));
  assert.ok(!fs.existsSync(path.join(home, '.claude/CLAUDE.md')));
});

test('installAll: a real directory of per-file links counts as installed, a partial one is a conflict', () => {
  const home = fakeHome();
  const hooksDir = path.join(home, '.ecc-shared/hooks');
  fs.mkdirSync(hooksDir, { recursive: true });
  const sourceDir = path.join(REPO, 'hooks', 'personal');
  for (const name of fs.readdirSync(sourceDir)) fs.symlinkSync(path.join(sourceDir, name), path.join(hooksDir, name));
  const ok = installAll({ home, repoRoot: REPO, agents: [] }).find(action => action.path === hooksDir);
  assert.strictEqual(ok.status, 'ok');
  fs.unlinkSync(path.join(hooksDir, fs.readdirSync(hooksDir)[0]));
  const partial = installAll({ home, repoRoot: REPO, agents: [] }).find(action => action.path === hooksDir);
  assert.strictEqual(partial.status, 'conflict');
});
