#!/usr/bin/env node
'use strict';

// Imports the third-party skills listed in personal/sources.json: clones
// each source at its pinned commit, copies the chosen skill directories
// into skills/<to>/, and writes THIRD_PARTY/<origin>/ with its license and
// an import manifest. Idempotent: re-running overwrites the previous copy.
//
//   node scripts/personal/import-skills.js [--only origin[,origin...]] [--dry-run]

const fs = require('fs');
const path = require('path');
const { importSource } = require('../lib/personal-import');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const args = { only: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only') args.only = new Set(String(argv[++i] || '').split(','));
    else if (argv[i] === '--dry-run') args.dryRun = true;
  }
  return args;
}

function main() {
  const { only, dryRun } = parseArgs(process.argv.slice(2));
  const sourcesPath = path.join(REPO_ROOT, 'personal', 'sources.json');
  const { sources } = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
  const skillsDir = path.join(REPO_ROOT, 'skills');
  const thirdPartyRoot = path.join(REPO_ROOT, 'THIRD_PARTY');

  for (const source of sources) {
    if (only && !only.has(source.origin)) continue;
    const names = source.skills.map(s => s.to).join(', ');
    if (dryRun) {
      console.log(`[dry-run] ${source.origin} @ ${source.sha.slice(0, 12)} -> ${names}`);
      continue;
    }
    console.log(`Importing ${source.origin} @ ${source.sha.slice(0, 12)} (${source.skills.length} skills)...`);
    importSource(source, { skillsDir, thirdPartyRoot });
    console.log(`  ok: ${names}`);
  }
}

main();
