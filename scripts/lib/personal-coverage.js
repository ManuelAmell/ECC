'use strict';

// Coverage check for the personal skill router: every skill the user depends
// on (everything imported from personal/sources.json plus the capability
// categories in personal/coverage.json) must exist and have at least one
// trigger in config/skill-triggers.json, unless it is listed in
// personal/trigger-exemptions.json with a reason (e.g. invoked internally by
// another skill). Pure function; the CLI wrapper does the file reading.

function triggerKey(entry) {
  return `${entry.kind || 'skill'}:${entry.skill}`;
}

function requiredSkills(sources, categories) {
  const required = new Map(); // skill id -> category label
  for (const source of sources) {
    for (const skill of source.skills) required.set(skill.to, `import:${source.origin}`);
  }
  for (const [category, entry] of Object.entries(categories)) {
    for (const id of entry.skills) if (!required.has(id)) required.set(id, category);
  }
  return required;
}

function computeCoverage({ sources, triggers, categories, exemptions, exists }) {
  const triggered = new Set(triggers.map(entry => entry.skill));
  const required = requiredSkills(sources, categories);
  const missing = [];
  const untriggered = [];
  for (const [id, category] of required) {
    if (!exists(id)) missing.push({ id, category });
    else if (!triggered.has(id) && !(id in exemptions)) untriggered.push({ id, category });
  }
  const staleExemptions = Object.keys(exemptions).filter(id => triggered.has(id) || !required.has(id) || !exists(id));
  const byCategory = {};
  for (const [id, category] of required) {
    byCategory[category] = byCategory[category] || { total: 0, triggered: 0 };
    byCategory[category].total++;
    if (triggered.has(id)) byCategory[category].triggered++;
  }
  return { missing, untriggered, staleExemptions, byCategory, total: required.size };
}

module.exports = { computeCoverage, requiredSkills, triggerKey };
