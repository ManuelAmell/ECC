#!/usr/bin/env node
'use strict';

/**
 * PreToolUse(Bash) hook for the orchestrator: every Orca worker must be started
 * with an ECC skill assignment. Denies `orchestration worker-start --spec` and
 * `orchestration task-create --spec` unless the command carries an
 * `ECC_REQUIRED_SKILLS:` line or builds the spec with `ecc-spec`.
 */

const STARTS_WORKER = /\borchestration\s+(worker-start|task-create)\b/;
const HAS_SPEC = /--spec\b/;
const HAS_ASSIGNMENT = /ECC_REQUIRED_SKILLS:|\becc-spec\b/;

function evaluate(payload) {
  const command = payload && payload.tool_input && payload.tool_input.command;
  if (typeof command !== 'string') return null;
  if (!STARTS_WORKER.test(command) || !HAS_SPEC.test(command)) return null;
  if (HAS_ASSIGNMENT.test(command)) return null;
  return (
    'ECC: todo worker necesita skills asignadas. Genera el --spec con ' +
    '`~/.ecc-shared/bin/ecc-spec --skills a,b --task "..."` ' +
    '(o incluye una línea "ECC_REQUIRED_SKILLS: a,b").'
  );
}

function main() {
  let raw = '';
  process.stdin.on('data', chunk => (raw += chunk));
  process.stdin.on('end', () => {
    let payload = {};
    try {
      payload = JSON.parse(raw || '{}');
    } catch {
      return;
    }
    const denial = evaluate(payload);
    if (denial) {
      process.stderr.write(`${denial}\n`);
      process.exitCode = 2;
    }
  });
}

if (require.main === module) main();

module.exports = { evaluate };
