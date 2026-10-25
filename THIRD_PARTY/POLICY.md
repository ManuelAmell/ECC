# Third-party skills policy

This fork imports skills written by others. This page records how, so every
import is reproducible, attributed and reviewable.

## Rules

1. **Pinned, never floating.** Each source in `personal/sources.json` names an exact commit SHA. Nothing updates itself.
2. **Attributed.** Every source has `THIRD_PARTY/<origin>/LICENSE` and `NOTICE.md` (URL, commit, license, what was imported and what was not). The fork is public, so MIT and Apache-2.0 notices must travel with the code. Each imported `SKILL.md` also carries `metadata.origin`, `upstream`, `upstreamSha` and `license`.
3. **Follows ECC's adaptation policy** (`docs/skill-adaptation-policy.md`). A direct port with a neutral, descriptive name keeps it. A skill that overlaps an ECC skill is renamed with a prefix so each keeps a clear boundary: `mp-` (Matt Pocock), `sp-` (obra/superpowers), `hf-` (HyperFrames blocks), `uxpm-` (UI/UX Pro Max). The frontmatter `name:` always equals the directory.
4. **Reviewed before use.** Skills are instructions that run with the agent's permissions. Before a source is added or its SHA moved: read every `SKILL.md`, read the scripts and references, grep for network calls, command execution and credential handling, and run `node scripts/ci/scan-supply-chain-iocs.js`.
5. **Optional where it depends on something external.** Skills that call paid APIs or run `npx` packages (HyperFrames, UI/UX Pro Max image helpers) live in opt-in modules (`personal-video`, `personal-design`) and only act with keys the user supplies.
6. **Own skills are marked as own.** Skills authored in this fork (for example `ecc-orchestrator`) carry `metadata.origin: personal` and are listed under `ownPaths` in `personal/modules.json`.

## Sources

| Origin | Repository | License | Module |
|---|---|---|---|
| `mattpocock` | mattpocock/skills | MIT | `personal-engineering` |
| `obra-superpowers` | obra/superpowers | MIT | `personal-engineering` |
| `hyperframes` | heygen-com/hyperframes | Apache-2.0 | `personal-video` |
| `ui-ux-pro-max` | nextlevelbuilder/ui-ux-pro-max-skill | MIT | `personal-design` |

Considered and not imported: `101-skills/superpowers` (inference.sh media SDK, not the workflow framework it is named after) and `SnailSploit/Claude-Red` (outside the scope of this workflow).

## Updating a source

1. Move the `sha` in `personal/sources.json` (and add/remove skills if needed).
2. `node scripts/personal/import-skills.js --only <origin>` re-copies from that commit.
3. `node scripts/personal/sync-manifests.js` refreshes the install modules and `package.json` `files`.
4. `node scripts/personal/coverage-report.js --check` confirms every skill still exists and has a trigger; add triggers in `config/skill-triggers.json` for new ones.
5. Run the validators in `scripts/ci/` and `node --test tests/personal`.

## Per-source adjustments

The importer can rewrite what a source assumes about its own layout: `rewrites` (literal text such as hard-coded install paths), `extra` metadata per skill (for example `stability: experimental`) and renames that also fix cross-references written as `` `name` ``, `"name"` or `/name` (never bare prose). See `scripts/lib/personal-import.js`.
