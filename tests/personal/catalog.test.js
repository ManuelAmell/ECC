'use strict';

// Tests scripts/lib/personal-coverage.js (every required skill exists and has
// a trigger) and scripts/lib/personal-manifests.js (install modules stay in
// sync with personal/sources.json), against both small fakes and the real
// repo data. No existing test covered these modules.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { computeCoverage } = require('../../scripts/lib/personal-coverage');
const { syncModules, modulePaths } = require('../../scripts/lib/personal-manifests');

const ROOT = path.join(__dirname, '..', '..');
const read = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

test('computeCoverage: reports missing skills, untriggered skills and stale exemptions', () => {
  const result = computeCoverage({
    sources: [{ origin: 'acme', skills: [{ to: 'a' }, { to: 'b' }, { to: 'gone' }] }],
    triggers: [{ skill: 'a' }, { skill: 'exempt-but-triggered' }],
    categories: { video: { skills: ['c'] } },
    exemptions: { b: 'internal', 'exempt-but-triggered': 'oops' },
    exists: id => id !== 'gone'
  });
  assert.deepStrictEqual(result.missing.map(m => m.id), ['gone']);
  assert.deepStrictEqual(result.untriggered.map(m => m.id), ['c']);
  assert.deepStrictEqual(result.staleExemptions, ['exempt-but-triggered']);
});

test('computeCoverage: a category skill already imported is counted once, under its import label', () => {
  const result = computeCoverage({
    sources: [{ origin: 'acme', skills: [{ to: 'a' }] }],
    triggers: [{ skill: 'a' }],
    categories: { video: { skills: ['a'] } },
    exemptions: {},
    exists: () => true
  });
  assert.strictEqual(result.total, 1);
  assert.deepStrictEqual(Object.keys(result.byCategory), ['import:acme']);
});

test('real repo: every imported and category skill exists and has a trigger', () => {
  const result = computeCoverage({
    sources: read('personal/sources.json').sources,
    triggers: read('config/skill-triggers.json').triggers,
    categories: read('personal/coverage.json'),
    exemptions: read('personal/trigger-exemptions.json'),
    exists: id => fs.existsSync(path.join(ROOT, 'skills', id))
  });
  assert.deepStrictEqual(result.missing, []);
  assert.deepStrictEqual(result.untriggered, []);
  assert.deepStrictEqual(result.staleExemptions, []);
});

test('modulePaths: unions and sorts the skills of every source that names the module', () => {
  const sources = [
    { module: 'm', skills: [{ to: 'b' }, { to: 'a' }] },
    { module: 'm', skills: [{ to: 'a' }, { to: 'c' }] },
    { module: 'other', skills: [{ to: 'z' }] }
  ];
  assert.deepStrictEqual(modulePaths(sources, 'm'), ['skills/a', 'skills/b', 'skills/c']);
});

test('syncModules: creates or refreshes the module and lists it in the full profile once', () => {
  const modules = { modules: [{ id: 'm', paths: ['skills/old'] }] };
  const profiles = { profiles: { full: { modules: ['m'] } } };
  const sources = [{ module: 'm', skills: [{ to: 'a' }] }];
  const defs = { m: { description: 'd', cost: 'light', stability: 'beta' }, n: { description: 'e', cost: 'heavy', stability: 'beta' } };
  syncModules(modules, profiles, sources, defs);
  assert.deepStrictEqual(modules.modules.find(m => m.id === 'm').paths, ['skills/a']);
  assert.ok(modules.modules.find(m => m.id === 'n'));
  assert.deepStrictEqual(profiles.profiles.full.modules, ['m', 'n']);
});

test('real repo: the committed install manifests match what personal/sources.json generates', () => {
  const modules = read('manifests/install-modules.json');
  const profiles = read('manifests/install-profiles.json');
  const before = JSON.stringify([modules, profiles]);
  syncModules(modules, profiles, read('personal/sources.json').sources, read('personal/modules.json'));
  assert.strictEqual(JSON.stringify([modules, profiles]), before);
});

const { syncPackageFiles, personalModulePaths } = require('../../scripts/lib/personal-manifests');

test('syncPackageFiles: inserts missing paths after the last skills/ entry and keeps formatting', () => {
  const text = '{\n  "files": [\n    "agents/",\n    "skills/a",\n    "skills/b"\n  ]\n}\n';
  const out = syncPackageFiles(text, ['skills/c', 'skills/a', 'skills/b0']);
  assert.deepStrictEqual(JSON.parse(out).files, ['agents/', 'skills/a', 'skills/b', 'skills/b0', 'skills/c']);
  assert.strictEqual(syncPackageFiles(out, ['skills/c']), out);
  const withTail = '{\n  "files": [\n    "skills/a",\n    "docs/x"\n  ]\n}\n';
  assert.deepStrictEqual(JSON.parse(syncPackageFiles(withTail, ['skills/z'])).files, ['skills/a', 'skills/z', 'docs/x']);
});

test('personalModulePaths: covers imported and own skills of every defined module', () => {
  const paths = personalModulePaths([{ module: 'm', skills: [{ to: 'a' }] }], { m: { ownPaths: ['skills/own'] } });
  assert.deepStrictEqual(paths, ['skills/a', 'skills/own']);
});

test('real repo: package.json files already lists every personal module path', () => {
  const text = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
  const paths = personalModulePaths(read('personal/sources.json').sources, read('personal/modules.json'));
  assert.strictEqual(syncPackageFiles(text, paths), text);
});
