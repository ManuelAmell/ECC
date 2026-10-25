# ui-ux-pro-max

Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
Commit: d14efff8ed1faa4187f004f79926f428c8074ec7
License: MIT

## Imported skills
- ui-ux-pro-max (from .claude/skills/ui-ux-pro-max)
- ui-styling (from .claude/skills/ui-styling)
- design (from .claude/skills/design)
- uxpm-design-system (from .claude/skills/design-system)
- brand (from .claude/skills/brand)
- slides (from .claude/skills/slides)
- banner-design (from .claude/skills/banner-design)

## Not imported
- cli/, gallery/, screenshots/, projects/, preview/ (npm CLI, demo site and marketing assets, not skills)
- src/ui-ux-pro-max (source of the same data already shipped under .claude/skills/ui-ux-pro-max)
- cli/assets/skills/* (duplicate copies of the skills above)

## Notes
Core scripts (search.py, core.py, design_system.py) are local-only. design/scripts/{logo,icon,cip}/generate.py call image APIs (Gemini, AtlasCloud, MuAPI) only with keys the user provides via env or ~/.claude/.env. ui-styling/scripts/shadcn_add.py runs npx shadcn. The run commands use ${CLAUDE_PLUGIN_ROOT}/.claude/skills/<skill>/; in the fork the skills live at the plugin root, so that prefix is rewritten to ${CLAUDE_PLUGIN_ROOT}/skills/ (ecc-spec further maps it to ~/.ecc-shared/repo/skills/ for workers outside the plugin). design-system is renamed uxpm-design-system because ECC already ships design-system.
