# ECC — instrucciones globales (fuente única)

Este archivo lo cargan Claude Code, OpenCode, Antigravity (`agy`) y Command Code (`cmdc`).
Aplica en TODOS los proyectos, tanto si eres el agente principal como si eres un sub-agente
lanzado por un orquestador (Orca u otro). Repo ECC: `~/.ecc-shared/repo` (skills en `repo/skills`,
agentes en `repo/agents`, reglas en `repo/rules`). Fork personal: https://github.com/ManuelAmell/ECC
(rama `personal`), con `upstream` = https://github.com/affaan-m/ECC.

Las instrucciones del proyecto (AGENTS.md / CLAUDE.md locales) tienen prioridad en caso de conflicto.

## Principios
1. Plan antes de ejecutar en tareas complejas.
2. TDD: test primero (RED) -> implementación mínima (GREEN) -> refactor; cobertura >= 80%.
3. Seguridad primero: sin secretos en código, validar entradas, consultas parametrizadas.
4. Inmutabilidad: crear objetos nuevos, no mutar.
5. Archivos pequeños y cohesivos (200-400 líneas típico, 800 máx.); errores nunca silenciados.
6. Commits convencionales: `feat|fix|refactor|docs|test|chore|perf|ci: descripción`.

## Flujo obligatorio
plan -> tdd -> implementación -> code-review -> security-review (si toca input/auth/datos) -> verificación (build + tests).
Si el agente soporta skills, usa: `tdd-workflow`, `security-review`, `verification-loop`, `coding-standards`.
Si no las soporta, lee el `SKILL.md` correspondiente en `~/.ecc-shared/repo/skills/<nombre>/SKILL.md`.

## Disparadores automáticos
En Claude Code, un hook `UserPromptSubmit` (`hooks/personal/ecc-skill-router.js`) lee cada prompt contra
`config/skill-triggers.json` (palabras clave en español e inglés) y sugiere hasta 3 skills — nunca las carga
ni bloquea el prompt. Para los demás agentes (sin ese hook), aplica el mismo criterio a mano: si el prompt
menciona un bug/falla -> `diagnosing-bugs`/`systematic-debugging`; una idea o feature nueva -> `brainstorming`
(úsala antes de planear, no la saltes); vídeo/animación -> `hyperframes`; spec/tickets -> `to-spec`/`to-tickets`.

## Reglas por lenguaje (leer al tocar ese lenguaje)
- Siempre: `~/.ecc-shared/repo/rules/common/`
- TypeScript/React/Next: `rules/typescript`, `rules/react`, `rules/web`; skills `frontend-patterns`, `react-patterns`, `nextjs-turbopack`
- Python/Django/FastAPI: `rules/python`; skills `python-patterns`, `python-testing`, `django-patterns`, `django-security`, `fastapi-patterns`
- Go: `rules/golang`; skills `golang-patterns`, `golang-testing`
- Rust: `rules/rust`; skills `rust-patterns`, `rust-testing`

## Orquestación (cuando delegas a otros agentes)
- Las skills del catálogo solo están instaladas en Claude Code. El orquestador decide qué skills necesita
  cada worker y las **inyecta** en su prompt; el worker no debe buscarlas.
- Genera siempre el `--spec` con `~/.ecc-shared/bin/ecc-spec --skills a,b --task "..."`, o con
  `~/.ecc-shared/bin/ecc-spec --auto --task "..."` para que elija las skills solo a partir del texto de la
  tarea usando `config/skill-triggers.json` (añade el preámbulo ECC, la línea `ECC_REQUIRED_SKILLS:`, el
  texto de cada skill y el contrato de cierre). Un hook deniega `worker-start` sin esa asignación.
- Al terminar, el worker incluye `ECC-SKILLS-APPLIED: a,b — evidencia`; un hook Stop se lo exige. El orquestador
  comprueba esa línea con `worker-read` antes de aceptar el `worker_done`; si falta, re-engancha al worker.
- Delega por especialidad: planner (planificar), tdd-guide (tests), code-reviewer (tras cambios),
  security-reviewer (código sensible), y el reviewer del lenguaje (typescript/react/python/django/fastapi/go/rust).
- Ejecuta en paralelo las tareas independientes; no cierres una tarea sin review y verificación.

### Enrutado de skills (tarea -> skills -> reviewer)
| Tarea | Skills | Reviewer |
|---|---|---|
| Idea o feature nueva (antes de planear) | `brainstorming`, `grill-me` | — |
| Bug / algo roto | `diagnosing-bugs`, `systematic-debugging` | `code-reviewer` |
| Función nueva o bug (cualquier lenguaje) | `tdd-workflow` + patrones del lenguaje | `code-reviewer` |
| API / backend | `backend-patterns`, `api-design` | `security-reviewer` |
| React / Next | `react-patterns`, `frontend-patterns` (+ `react-testing`, `nextjs-turbopack`) | `react-reviewer` |
| Django | `django-patterns`, `django-security`, `python-testing` | `django-reviewer` |
| FastAPI | `fastapi-patterns`, `python-patterns`, `python-testing` | `fastapi-reviewer` |
| Python general | `python-patterns`, `python-testing` | `python-reviewer` |
| Go | `golang-patterns`, `golang-testing` | `go-reviewer` |
| Rust | `rust-patterns`, `rust-testing` | `rust-reviewer` |
| BD / migraciones | `postgres-patterns`, `database-migrations` | `database-reviewer` |
| E2E / Docker | `e2e-testing` / `docker-patterns` | `code-reviewer` |
| Spec / tickets a partir de una idea | `to-spec`, `to-tickets`, `implement-spec` | — |
| Vídeo / animación / render | `hyperframes`, `media-use` | — |
| Antes de cerrar cualquier tarea | `verification-loop`, `security-review` si toca input/auth/datos | — |

Máximo 2-3 skills por worker; las skills largas se recortan, el texto completo está en `~/.ecc-shared/repo/skills/<nombre>/SKILL.md`.
Lista completa de las skills de terceros importadas y por qué: `~/.ecc-shared/repo/THIRD_PARTY/*/NOTICE.md`.

## Contexto
Carga skills bajo demanda, no todas a la vez. Catálogo completo: `~/.ecc-shared/repo/AGENTS.md`.
