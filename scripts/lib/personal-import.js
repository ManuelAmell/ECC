'use strict';

// Helpers for scripts/personal/import-skills.js: clone a pinned source
// commit, copy its skill directories into skills/<to>/, stamp ECC metadata
// onto each SKILL.md frontmatter, rewrite cross-references for any renamed
// skill, and drop a THIRD_PARTY notice recording origin, URL, SHA and
// license for every imported skill (required by the MIT/Apache-2.0 terms
// of the sources, since this fork is public).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', ...options });
}

function cloneAtSha(repoUrl, sha) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-import-'));
  run('git', ['clone', '--quiet', repoUrl, dir]);
  run('git', ['checkout', '--quiet', sha], { cwd: dir });
  return dir;
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

function splitFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: '', body: text };
  return { frontmatter: match[1], body: match[2] };
}

// Minimal, dependency-free rewrite: drop any upstream `license:` line (we
// track license via THIRD_PARTY/, not per-file) and append our own
// `metadata:` block. Good enough for the simple `key: value` frontmatter
// these sources use; anything structured is left untouched.
function stampMetadata(skillMdPath, source) {
  const raw = fs.readFileSync(skillMdPath, 'utf8');
  const { frontmatter, body } = splitFrontmatter(raw);
  if (!frontmatter) return;
  const ours = [`  origin: ${source.origin}`, `  upstream: ${source.url}`, `  upstreamSha: ${source.sha}`, `  license: ${source.license}`];
  const lines = frontmatter.split('\n').filter(line => !/^license:/i.test(line));

  // The upstream skill may already declare its own top-level `metadata:`
  // block (e.g. hyperframes' `internal: true`). YAML forbids a duplicate
  // top-level key, so merge our keys into that existing block instead of
  // appending a second `metadata:` — insert right after the key, ahead of
  // its existing indented children.
  const metadataIndex = lines.findIndex(line => /^metadata:\s*$/.test(line));
  if (metadataIndex === -1) {
    lines.push('metadata:', ...ours);
  } else {
    lines.splice(metadataIndex + 1, 0, ...ours);
  }
  fs.writeFileSync(skillMdPath, `---\n${lines.join('\n')}\n---\n${body}`);
}

function renameMap(skills) {
  const map = new Map();
  for (const skill of skills) {
    const from = path.basename(skill.from);
    if (from !== skill.to) map.set(from, skill.to);
  }
  return map;
}

// Rewrite exact-word references to a renamed skill (e.g. the Skill tool
// call `"grilling"`) across every file copied from this source. Scoped to
// the skills just imported from this source, never the wider repo.
function rewriteRenames(skillsDir, skills) {
  const renames = renameMap(skills);
  if (renames.size === 0) return;
  for (const skill of skills) {
    const dir = path.join(skillsDir, skill.to);
    walk(dir, file => {
      if (!/\.(md|mdx|json|js|ts)$/.test(file)) return;
      let text = fs.readFileSync(file, 'utf8');
      let changed = false;
      for (const [from, to] of renames) {
        const pattern = new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
        if (pattern.test(text)) {
          text = text.replace(pattern, to);
          changed = true;
        }
      }
      if (changed) fs.writeFileSync(file, text);
    });
  }
}

function walk(dir, onFile) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, onFile);
    else onFile(full);
  }
}

function writeThirdPartyNotice(thirdPartyDir, source, cloneDir) {
  fs.mkdirSync(thirdPartyDir, { recursive: true });
  const licenseFile = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'].find(name => fs.existsSync(path.join(cloneDir, name)));
  if (licenseFile) fs.copyFileSync(path.join(cloneDir, licenseFile), path.join(thirdPartyDir, 'LICENSE'));
  const imported = source.skills.map(skill => `- ${skill.to} (from ${skill.from})`).join('\n');
  const excluded = (source.excluded || []).map(entry => `- ${entry}`).join('\n');
  fs.writeFileSync(
    path.join(thirdPartyDir, 'NOTICE.md'),
    [
      `# ${source.origin}`,
      '',
      `Source: ${source.url}`,
      `Commit: ${source.sha}`,
      `License: ${source.license}`,
      '',
      '## Imported skills',
      imported,
      '',
      '## Not imported',
      excluded || '(none)',
      source.notes ? `\n## Notes\n${source.notes}\n` : ''
    ].join('\n')
  );
}

function importSource(source, { skillsDir, thirdPartyRoot }) {
  const cloneDir = cloneAtSha(source.url, source.sha);
  try {
    for (const skill of source.skills) {
      copyDir(path.join(cloneDir, skill.from), path.join(skillsDir, skill.to));
    }
    rewriteRenames(skillsDir, source.skills);
    for (const skill of source.skills) {
      stampMetadata(path.join(skillsDir, skill.to, 'SKILL.md'), source);
    }
    writeThirdPartyNotice(path.join(thirdPartyRoot, source.origin), source, cloneDir);
  } finally {
    fs.rmSync(cloneDir, { recursive: true, force: true });
  }
}

module.exports = { importSource, cloneAtSha, stampMetadata, rewriteRenames, splitFrontmatter };
