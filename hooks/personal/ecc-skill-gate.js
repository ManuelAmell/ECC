#!/usr/bin/env node
'use strict';

/**
 * Stop hook: a dispatched worker must report how it applied the skills the
 * orchestrator required. No-op in any session whose first user message does
 * not carry an `ECC_REQUIRED_SKILLS:` line.
 *
 * Blocks at most MAX_BLOCKS times per session so it can never wedge an agent.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const APPLIED = 'ECC-SKILLS-APPLIED:';
const MAX_BLOCKS = 2;

function textOf(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textOf).join('\n');
  if (value && typeof value === 'object') {
    if (typeof value.text === 'string') return value.text;
    if (value.content !== undefined) return textOf(value.content);
    if (value.message !== undefined) return textOf(value.message);
  }
  return '';
}

function roleOf(entry) {
  return entry.role || (entry.message && entry.message.role) || entry.type || '';
}

function isToolResult(entry) {
  const content = entry.message ? entry.message.content : entry.content;
  return Array.isArray(content) && content.some(part => part && part.type === 'tool_result');
}

function readEntries(transcriptPath) {
  let raw = '';
  try {
    raw = fs.readFileSync(transcriptPath, 'utf8');
  } catch {
    return [];
  }
  const entries = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

function requiredSkills(entries) {
  const first = entries.find(entry => roleOf(entry) === 'user' && !isToolResult(entry));
  if (!first) return [];
  const match = textOf(first).match(/^[ \t]*ECC_REQUIRED_SKILLS:[ \t]*(.+)$/m);
  if (!match) return [];
  return match[1].split(',').map(s => s.trim()).filter(Boolean);
}

function lastAssistantText(entries, payload) {
  if (typeof payload.last_assistant_message === 'string' && payload.last_assistant_message) {
    return payload.last_assistant_message;
  }
  for (let i = entries.length - 1; i >= 0; i--) {
    if (roleOf(entries[i]) === 'assistant') {
      const text = textOf(entries[i]);
      if (text) return text;
    }
  }
  return '';
}

function missingSkills(text, skills) {
  const at = text.indexOf(APPLIED);
  if (at === -1) return skills;
  const block = text.slice(at + APPLIED.length).split(/\n\s*\n/)[0];
  return skills.filter(skill => !block.includes(skill));
}

function blockCount(key) {
  try {
    return Number(fs.readFileSync(key, 'utf8')) || 0;
  } catch {
    return 0;
  }
}

function evaluate(payload, stateDir = os.tmpdir()) {
  if (payload.stop_hook_active) return null;
  const entries = readEntries(payload.transcript_path || '');
  const skills = requiredSkills(entries);
  if (skills.length === 0) return null;

  const missing = missingSkills(lastAssistantText(entries, payload), skills);
  if (missing.length === 0) return null;

  const id = String(payload.session_id || payload.transcript_path || 'session')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(-80);
  const key = path.join(stateDir, `ecc-skill-gate-${id}`);
  const count = blockCount(key);
  if (count >= MAX_BLOCKS) return null;
  try {
    fs.writeFileSync(key, String(count + 1));
  } catch {
    // best effort; MAX_BLOCKS is only a second guard
  }

  return {
    decision: 'block',
    reason:
      `El orquestador exigió las skills: ${skills.join(', ')}. Antes de terminar, añade una línea ` +
      `"${APPLIED} ${skills.join(',')} — <una frase de evidencia por skill>" que mencione ` +
      `${missing.join(', ')}. Si no aplicas alguna, explica por qué.`
  };
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
    const result = evaluate(payload);
    if (result) process.stdout.write(JSON.stringify(result));
  });
}

if (require.main === module) main();

module.exports = { evaluate, requiredSkills, missingSkills, textOf };
