#!/usr/bin/env node
'use strict';

/**
 * PostToolUse(Bash) hook for the Orca coordinator: when an
 * `orchestration check` result carries worker_done messages, remind the
 * coordinator of the acceptance steps before it acknowledges the delivery.
 * Context-only (never blocks); silent for every other command or result.
 */

const CHECK_COMMAND = /\borchestration\s+check\b/;
const WORKER_DONE = /"type"\s*:\s*"worker_done"/g;

function responseText(response) {
  if (typeof response === 'string') return response;
  if (response && typeof response === 'object') {
    return [response.stdout, response.output, response.content]
      .filter(value => typeof value === 'string')
      .join('\n');
  }
  return '';
}

function evaluate(payload) {
  const command = payload && payload.tool_input && payload.tool_input.command;
  if (typeof command !== 'string' || !CHECK_COMMAND.test(command)) return null;
  const count = (responseText(payload.tool_response).match(WORKER_DONE) || []).length;
  if (count === 0) return null;
  const noun = count === 1 ? 'worker_done' : `${count} worker_done`;
  return (
    `ECC: llegó ${noun}. Antes de hacer --ack: ` +
    '(1) worker-read de cada Dispatch y comprueba la línea "ECC-SKILLS-APPLIED" con las skills exigidas; ' +
    'si falta, send --to dispatch:<id> para que la añada. ' +
    '(2) El trabajo de implementación pasa por una etapa de revisión aparte (code-reviewer / security-reviewer); ' +
    'tú sintetizas, no editas sus archivos. ' +
    '(3) Procesa el lote completo y decide para cada worker: reutilizar, worker-retain o worker-release. ' +
    '(4) Cierra con verification-loop y un reporte por tarea (resultado, evidencia, bloqueos).'
  );
}

function main() {
  let raw = '';
  process.stdin.on('data', chunk => (raw += chunk));
  process.stdin.on('end', () => {
    try {
      const message = evaluate(JSON.parse(raw || '{}'));
      if (message) {
        process.stdout.write(
          JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: message } })
        );
      }
    } catch {
      // Never interfere with a tool result over a hook problem.
    }
  });
}

if (require.main === module) main();

module.exports = { evaluate };
