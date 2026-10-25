#!/usr/bin/env node
'use strict';

// Regenerates the personal-* install modules from personal/sources.json, adds
// them to the `full` profile and to package.json `files`.
//
//   node scripts/personal/sync-manifests.js [--check]
//
// --check exits 1 when the manifests are out of date instead of writing.

const fs = require('fs');
const path = require('path');
const { syncModules, syncPackageFiles, personalModulePaths } = require('../lib/personal-manifests');

const ROOT = path.resolve(__dirname, '..', '..');
const read = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const serialize = data => `${JSON.stringify(data, null, 2)}\n`;

function main() {
  const check = process.argv.includes('--check');
  const { sources } = read('personal/sources.json');
  const definitions = read('personal/modules.json');
  const modules = read('manifests/install-modules.json');
  const profiles = read('manifests/install-profiles.json');
  syncModules(modules, profiles, sources, definitions);

  const packageText = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
  const outputs = [
    ['manifests/install-modules.json', serialize(modules)],
    ['manifests/install-profiles.json', serialize(profiles)],
    ['package.json', syncPackageFiles(packageText, personalModulePaths(sources, definitions))]
  ];
  const stale = outputs.filter(([file, text]) => fs.readFileSync(path.join(ROOT, file), 'utf8') !== text);
  if (check) {
    if (stale.length) {
      console.error(`Out of date: ${stale.map(([file]) => file).join(', ')} (run without --check)`);
      process.exit(1);
    }
    console.log('Install manifests are in sync with personal/sources.json');
    return;
  }
  for (const [file, text] of stale) fs.writeFileSync(path.join(ROOT, file), text);
  console.log(stale.length ? `Updated: ${stale.map(([file]) => file).join(', ')}` : 'Already in sync');
}

main();
