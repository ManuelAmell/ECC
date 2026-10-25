'use strict';

// Orchestration presets for the Orca coordinator (personal/orchestration-presets.json).
// Pure helpers: expand a preset into an ordered stage plan, validate the data
// against the skills that exist, and split stages into parallel-safe waves.
// Nothing here launches anything; the coordinator runs the commands it prints.

function expandSkills(stage, lang, langSkills) {
  const out = [];
  for (const skill of stage.skills) {
    if (skill === '{lang}') out.push(...(langSkills[lang] || []));
    else out.push(skill);
  }
  return [...new Set(out)];
}

function getPreset(data, name) {
  const preset = data.presets[name];
  if (!preset) throw new Error(`Preset desconocido: ${name} (disponibles: ${Object.keys(data.presets).join(', ')})`);
  return preset;
}

function getStage(preset, id) {
  const stage = preset.stages.find(candidate => candidate.id === id);
  if (!stage) throw new Error(`Etapa desconocida: ${id} (disponibles: ${preset.stages.map(s => s.id).join(', ')})`);
  return stage;
}

function buildPlan(data, name, { lang } = {}) {
  if (lang && !data.langSkills[lang]) {
    throw new Error(`Lenguaje desconocido: ${lang} (disponibles: ${Object.keys(data.langSkills).join(', ')})`);
  }
  const preset = getPreset(data, name);
  return {
    preset: name,
    description: preset.description,
    maxParallel: data.maxParallel,
    stages: preset.stages.map(stage => ({
      id: stage.id,
      agent: stage.agent,
      worktree: stage.worktree,
      deps: stage.deps,
      readOnly: Boolean(stage.readOnly),
      exclusive: Boolean(stage.exclusive),
      skills: expandSkills(stage, lang, data.langSkills)
    }))
  };
}

// Groups stages into waves: every stage in a wave has all its deps settled in
// an earlier wave; an exclusive stage always gets a wave of its own; waves are
// capped at maxParallel. This is the order a coordinator may launch them in.
function toWaves(plan) {
  const settled = new Set();
  const waves = [];
  let pending = [...plan.stages];
  while (pending.length) {
    const ready = pending.filter(stage => stage.deps.every(dep => settled.has(dep)));
    if (ready.length === 0) throw new Error('Dependencias circulares o desconocidas en el preset');
    const exclusive = ready.find(stage => stage.exclusive);
    const wave = exclusive ? [exclusive] : ready.filter(stage => !stage.exclusive).slice(0, plan.maxParallel);
    waves.push(wave.map(stage => stage.id));
    for (const stage of wave) settled.add(stage.id);
    pending = pending.filter(stage => !wave.includes(stage));
  }
  return waves;
}

function validatePresets(data, skillExists) {
  const problems = [];
  const langIds = new Set(Object.keys(data.langSkills));
  for (const [lang, skills] of Object.entries(data.langSkills)) {
    for (const skill of skills) if (!skillExists(skill)) problems.push(`langSkills.${lang}: skill inexistente ${skill}`);
  }
  for (const [name, preset] of Object.entries(data.presets)) {
    const ids = new Set(preset.stages.map(stage => stage.id));
    for (const stage of preset.stages) {
      for (const dep of stage.deps) if (!ids.has(dep)) problems.push(`${name}.${stage.id}: dependencia desconocida ${dep}`);
      for (const skill of stage.skills) {
        if (skill === '{lang}') continue;
        if (!skillExists(skill)) problems.push(`${name}.${stage.id}: skill inexistente ${skill}`);
      }
    }
    try {
      toWaves(buildPlan(data, name, { lang: [...langIds][0] }));
    } catch (error) {
      problems.push(`${name}: ${error.message}`);
    }
  }
  return problems;
}

module.exports = { buildPlan, getPreset, getStage, expandSkills, toWaves, validatePresets };
