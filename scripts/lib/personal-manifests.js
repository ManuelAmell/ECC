'use strict';

// Keeps manifests/install-modules.json and install-profiles.json in step with
// personal/sources.json so an imported skill can never be missing from the
// installer (validate-install-manifests fails on unreferenced skills).
//
// Each source names the install module that ships it (`module`); module
// definitions (description, cost, stability) live in `personal/modules.json`.

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
    const paths = modulePaths(sources, id);
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

module.exports = { syncModules, modulePaths, TARGETS };
