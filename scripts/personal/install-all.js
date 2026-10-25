#!/usr/bin/env node
'use strict';

// Installs the personal ECC layer into the user's agents (see
// scripts/lib/personal-install.js for exactly what each agent gets).
//
//   node scripts/personal/install-all.js [--dry-run] [--home <dir>] [--agents claude,opencode,antigravity,commandcode]
//
// Idempotent: a second run reports everything as `ok`. It never overwrites an
// existing file that is not its own link; those are reported as `conflict`.

const os = require('os');
const path = require('path');
const { installAll } = require('../lib/personal-install');

function parseArgs(argv) {
  const args = { dryRun: false, home: os.homedir(), agents: undefined };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--home') args.home = path.resolve(argv[++i]);
    else if (argv[i] === '--agents') args.agents = String(argv[++i] || '').split(',').filter(Boolean);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '..', '..');
  const actions = installAll({ ...args, repoRoot });
  for (const action of actions) console.log(`${action.status.padEnd(14)} ${action.kind.padEnd(7)} ${action.path}  ${action.detail}`);
  const conflicts = actions.filter(action => action.status === 'conflict').length;
  const changes = actions.filter(action => action.status === 'created').length;
  console.log(`\n${args.dryRun ? '[dry-run] would change' : 'changed'}: ${changes}, conflicts: ${conflicts}`);
  if (conflicts) process.exitCode = 1;
}

main();
