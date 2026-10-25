'use strict';

// Idempotent installer core for the personal ECC layer across agents.
//
//   ~/.ecc-shared/{repo,ECC.md,bin,hooks}   stable aliases into this repo
//   Claude Code    CLAUDE.md import + 4 hooks in settings.json
//   OpenCode       AGENTS.md -> ECC.md
//   Antigravity    GEMINI.md -> ECC.md
//   Command Code   AGENTS.md -> ECC.md + Stop hook
//
// Every function returns actions ({kind, path, status, detail}) and only
// writes when `dryRun` is false. It never overwrites a file it does not own:
// an existing real file or a link to somewhere else is reported as `conflict`.

const fs = require('fs');
const path = require('path');

const HOOKS = {
  claude: [
    { event: 'PreToolUse', matcher: 'Bash', script: 'ecc-spawn-gate.js', timeout: 10 },
    { event: 'Stop', script: 'ecc-skill-gate.js', timeout: 10 },
    { event: 'UserPromptSubmit', script: 'ecc-skill-router.js', timeout: 5 },
    { event: 'PostToolUse', matcher: 'Bash', script: 'ecc-done-reminder.js', timeout: 5 }
  ],
  commandcode: [{ event: 'Stop', script: 'ecc-skill-gate.js', timeout: 10 }]
};

function linkStatus(target, linkPath) {
  let stat;
  try {
    stat = fs.lstatSync(linkPath);
  } catch {
    return 'missing';
  }
  if (stat.isSymbolicLink()) {
    return path.resolve(path.dirname(linkPath), fs.readlinkSync(linkPath)) === path.resolve(target) ? 'ok' : 'conflict';
  }
  return stat.isDirectory() && isDirOfLinks(target, linkPath) ? 'ok' : 'conflict';
}

// A real directory whose entries are links to every entry of `target` (the
// layout produced by linking file by file) is equivalent to a directory link.
function isDirOfLinks(target, dirPath) {
  let wanted;
  try {
    wanted = fs.readdirSync(target);
  } catch {
    return false;
  }
  return wanted.length > 0 && wanted.every(name => linkStatus(path.join(target, name), path.join(dirPath, name)) === 'ok');
}

function ensureLink(target, linkPath, { dryRun }) {
  const status = linkStatus(target, linkPath);
  if (status === 'missing') {
    if (!dryRun) {
      fs.mkdirSync(path.dirname(linkPath), { recursive: true });
      fs.symlinkSync(target, linkPath);
    }
    return { kind: 'link', path: linkPath, status: 'created', detail: `-> ${target}` };
  }
  return { kind: 'link', path: linkPath, status, detail: status === 'conflict' ? 'exists and is not our link; left untouched' : `-> ${target}` };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function ensureHook(settingsPath, spec, command, { dryRun, backupDir }) {
  const settings = readJson(settingsPath);
  if (settings === null) return { kind: 'hook', path: settingsPath, status: 'skipped', detail: 'settings.json missing or unreadable' };
  const groups = ((settings.hooks = settings.hooks || {})[spec.event] = settings.hooks[spec.event] || []);
  const present = groups.some(group => (group.hooks || []).some(hook => hook.command === command));
  const label = `${spec.event} ${spec.script}`;
  if (present) return { kind: 'hook', path: settingsPath, status: 'ok', detail: label };
  groups.push({ ...(spec.matcher ? { matcher: spec.matcher } : {}), hooks: [{ type: 'command', command, timeout: spec.timeout }] });
  if (!dryRun) {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(settingsPath, path.join(backupDir, `${path.basename(path.dirname(settingsPath))}-settings-${Date.now()}.json`));
    fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  }
  return { kind: 'hook', path: settingsPath, status: 'created', detail: label };
}

function ensureImportLine(file, line, { dryRun }) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (current !== null && current.split('\n').some(entry => entry.trim() === line)) return { kind: 'import', path: file, status: 'ok', detail: line };
  if (!dryRun) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, current === null ? `# Instrucciones globales\n\n${line}\n` : `${current.replace(/\n*$/, '\n')}\n${line}\n`);
  }
  return { kind: 'import', path: file, status: 'created', detail: line };
}

function installAll({ home, repoRoot, dryRun = false, agents = ['claude', 'opencode', 'antigravity', 'commandcode'] }) {
  const options = { dryRun, backupDir: path.join(home, '.ecc-shared', 'backups') };
  const shared = path.join(home, '.ecc-shared');
  const actions = [];
  const link = (target, linkPath) => actions.push(ensureLink(target, linkPath, options));

  link(repoRoot, path.join(shared, 'repo'));
  link(path.join(repoRoot, 'personal', 'ECC.md'), path.join(shared, 'ECC.md'));
  link(path.join(repoRoot, 'personal', 'bin'), path.join(shared, 'bin'));
  link(path.join(repoRoot, 'hooks', 'personal'), path.join(shared, 'hooks'));
  link(path.join(repoRoot, 'tests', 'personal'), path.join(shared, 'tests'));

  const hookCommand = script => `node ${path.join(shared, 'hooks', script)}`;
  const present = dir => fs.existsSync(path.join(home, dir));
  const skip = (agent, dir) => actions.push({ kind: 'agent', path: path.join(home, dir), status: 'not-installed', detail: agent });

  if (agents.includes('claude')) {
    if (!present('.claude')) skip('claude', '.claude');
    else {
      actions.push(ensureImportLine(path.join(home, '.claude', 'CLAUDE.md'), '@~/.ecc-shared/ECC.md', options));
      for (const spec of HOOKS.claude) actions.push(ensureHook(path.join(home, '.claude', 'settings.json'), spec, hookCommand(spec.script), options));
    }
  }
  const instructionLinks = [
    ['opencode', '.config/opencode', '.config/opencode/AGENTS.md'],
    ['antigravity', '.gemini', '.gemini/GEMINI.md'],
    ['commandcode', '.commandcode', '.commandcode/AGENTS.md']
  ];
  for (const [agent, dir, file] of instructionLinks) {
    if (!agents.includes(agent)) continue;
    if (!present(dir)) skip(agent, dir);
    else link(path.join(shared, 'ECC.md'), path.join(home, file));
  }
  if (agents.includes('commandcode') && present('.commandcode')) {
    for (const spec of HOOKS.commandcode) actions.push(ensureHook(path.join(home, '.commandcode', 'settings.json'), spec, hookCommand(spec.script), options));
  }
  return actions;
}

module.exports = { installAll, ensureLink, ensureHook, ensureImportLine, linkStatus, HOOKS };
