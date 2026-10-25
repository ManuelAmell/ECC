'use strict';

// Keeps manifests/install-modules.json and install-profiles.json in step with
// personal/sources.json so an imported skill can never be missing from the
// installer (validate-install-manifests fails on unreferenced skills).
//
// Each source names the install module that ships it (`module`); module
// definitions (description, cost, stability) live in `personal/modules.json`;
// `ownPaths` lists skills authored in this fork rather than imported.

const TARGETS = ['claude', 'claude-project', 'cursor', 'codex', 'copilot', 'opencode', 'codebuddy', 'joycode', 'qwen', 'zed'];

function modulePaths(sources, moduleId) {
  const paths = sources
    .filter(source => source.module === moduleId)
    .flatMap(source => source.skills.map(skill => `skills/${skill.to}`));
  return [...new Set(paths)].sort();
}

function syncModules(modulesManifest, profilesManifest, sources, definitions) {
  const modules = modulesManifest.modules;
  for (const [id, definition] of Object.entries(definitions)) {
    const paths = [...new Set([...modulePaths(sources, id), ...(definition.ownPaths || [])])].sort();
    const next = {
      id,
      kind: 'skills',
      description: definition.description,
      paths,
      targets: TARGETS,
      dependencies: ['platform-configs'],
      defaultInstall: false,
      cost: definition.cost,
      stability: definition.stability
    };
    const index = modules.findIndex(module => module.id === id);
    if (index === -1) modules.push(next);
    else modules[index] = next;
    // validate-install-manifests requires the `full` profile to list every module.
    const full = profilesManifest.profiles.full.modules;
    if (!full.includes(id)) full.push(id);
  }
  return { modulesManifest, profilesManifest };
}

// package.json `files` lists every module path explicitly (the publish-surface
// test derives the expected list from the module graph). Insert the missing
// ones after the last `skills/` entry as text, so the rest of the file keeps
// its formatting (a JSON round-trip would reformat unrelated lines).
function syncPackageFiles(packageJsonText, paths) {
  const existing = new Set(JSON.parse(packageJsonText).files);
  const missing = [...new Set(paths)].filter(entry => !existing.has(entry)).sort();
  if (missing.length === 0) return packageJsonText;
  const lines = packageJsonText.split('\n');
  let last = -1;
  lines.forEach((line, index) => {
    if (/^\s+"skills\//.test(line)) last = index;
  });
  if (last === -1) throw new Error('package.json files has no skills/ entry to anchor on');
  const indent = lines[last].match(/^\s+/)[0];
  const hadComma = lines[last].trimEnd().endsWith(',');
  const added = missing.map((entry, index) => {
    const isLast = index === missing.length - 1;
    return `${indent}"${entry}"${isLast && !hadComma ? '' : ','}`;
  });
  if (!hadComma) lines[last] = `${lines[last].trimEnd()},`;
  lines.splice(last + 1, 0, ...added);
  return lines.join('\n');
}

function personalModulePaths(sources, definitions) {
  return Object.entries(definitions).flatMap(([id, definition]) => [
    ...modulePaths(sources, id),
    ...(definition.ownPaths || [])
  ]);
}

module.exports = { syncModules, modulePaths, syncPackageFiles, personalModulePaths, TARGETS };
