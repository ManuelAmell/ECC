'use strict';

// Tests the pure helpers of scripts/lib/personal-import.js (frontmatter
// stamping, rename-safe reference rewriting, literal path rewrites). The
// network-bound parts (git clone) are not exercised here. No existing test
// covered this module.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { stampMetadata, rewriteRenames, applyLiteralRewrites, splitFrontmatter } = require('../../scripts/lib/personal-import');

const SOURCE = { origin: 'acme', url: 'https://github.com/acme/skills', sha: 'abc123', license: 'MIT' };

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-import-test-'));
}

function writeSkill(root, name, body, frontmatter = `name: ${name}\ndescription: Use when testing`) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\n${frontmatter}\n---\n${body}`);
  return path.join(dir, 'SKILL.md');
}

test('stampMetadata: forces name to the new directory name and adds origin keys', () => {
  const root = tmp();
  const file = writeSkill(root, 'mp-tdd', 'body', 'name: tdd\ndescription: Use when testing\nlicense: MIT');
  stampMetadata(file, SOURCE, { from: 'skills/tdd', to: 'mp-tdd' });
  const { frontmatter } = splitFrontmatter(fs.readFileSync(file, 'utf8'));
  assert.match(frontmatter, /^name: mp-tdd$/m);
  assert.doesNotMatch(frontmatter, /^license:/m);
  assert.match(frontmatter, /^ {2}origin: acme$/m);
  assert.match(frontmatter, /^ {2}upstreamSha: abc123$/m);
});

test('stampMetadata: stamps per-skill extras and merges into an existing metadata block', () => {
  const root = tmp();
  const file = writeSkill(root, 'wip', 'body', 'name: wip\ndescription: Use when x\nmetadata:\n  internal: true');
  stampMetadata(file, SOURCE, { to: 'wip', extra: { stability: 'experimental' } });
  const { frontmatter } = splitFrontmatter(fs.readFileSync(file, 'utf8'));
  assert.strictEqual((frontmatter.match(/^metadata:/gm) || []).length, 1);
  assert.match(frontmatter, /^ {2}stability: experimental$/m);
  assert.match(frontmatter, /^ {2}internal: true$/m);
});

test('rewriteRenames: rewrites skill-reference-shaped mentions only, never bare prose', () => {
  const root = tmp();
  const skills = [{ from: 'skills/pr', to: 'mp-pr' }];
  const file = writeSkill(root, 'mp-pr', 'Run `pr`, or /pr, or "pr". Then open a pr and review the pr list.');
  rewriteRenames(root, skills);
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /Run `mp-pr`, or \/mp-pr, or "mp-pr"\./);
  assert.match(text, /open a pr and review the pr list/);
});

test('rewriteRenames: does nothing when no skill was renamed', () => {
  const root = tmp();
  const file = writeSkill(root, 'same', 'call `same`');
  rewriteRenames(root, [{ from: 'skills/same', to: 'same' }]);
  assert.match(fs.readFileSync(file, 'utf8'), /call `same`/);
});

test('applyLiteralRewrites: replaces hard-coded install paths in text files of imported skills', () => {
  const root = tmp();
  const file = writeSkill(root, 'ui', 'python3 .claude/skills/ui/scripts/search.py "x"');
  fs.mkdirSync(path.join(root, 'ui', 'scripts'));
  const script = path.join(root, 'ui', 'scripts', 'run.sh');
  fs.writeFileSync(script, 'cd .claude/skills/ui');
  applyLiteralRewrites(root, [{ to: 'ui' }], [{ from: '.claude/skills/', to: '~/.ecc-shared/repo/skills/' }]);
  assert.match(fs.readFileSync(file, 'utf8'), /python3 ~\/\.ecc-shared\/repo\/skills\/ui\/scripts\/search\.py/);
  assert.match(fs.readFileSync(script, 'utf8'), /cd ~\/\.ecc-shared\/repo\/skills\/ui/);
});
