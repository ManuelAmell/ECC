#!/usr/bin/env node
'use strict';

// Prints which required skills lack a trigger (see scripts/lib/personal-coverage.js).
//
//   node scripts/personal/coverage-report.js [--check]
//
// --check exits 1 when a required skill is missing or has no trigger.

const fs = require('fs');
const path = require('path');
const { computeCoverage } = require('../lib/personal-coverage');

const ROOT = path.resolve(__dirname, '..', '..');
const read = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

function main() {
  const result = computeCoverage({
    sources: read('personal/sources.json').sources,
    triggers: read('config/skill-triggers.json').triggers,
    categories: read('personal/coverage.json'),
    exemptions: read('personal/trigger-exemptions.json'),
    exists: id => fs.existsSync(path.join(ROOT, 'skills', id))
  });

  for (const [category, { total, triggered }] of Object.entries(result.byCategory)) {
    console.log(`${category.padEnd(28)} ${triggered}/${total} with triggers`);
  }
  for (const { id, category } of result.missing) console.error(`MISSING skill ${id} (${category})`);
  for (const { id, category } of result.untriggered) console.error(`NO TRIGGER ${id} (${category})`);
  for (const id of result.staleExemptions) console.error(`STALE exemption ${id}`);

  const failed = result.missing.length + result.untriggered.length + result.staleExemptions.length;
  console.log(failed ? `\n${failed} problem(s)` : `\nOK: all ${result.total} required skills exist and are covered`);
  if (process.argv.includes('--check') && failed) process.exit(1);
}

main();
