---
name: ecc-orchestrator
description: Use when the user asks to orchestrate, delegate, run workers or agents in parallel, "use Orca", or split a feature, bug, UI, video or research task across supervised Orca workers — picks skills per stage, launches workers with ecc-spec, verifies each result and releases them.
metadata:
  origin: personal
---

# ECC Orchestrator (Orca)

Coordinate supervised Orca workers so every unit of work gets the right skills, an independent review and a verified result. This skill is the ECC layer on top of Orca's own `orchestration` skill: load that one for the exact CLI contract (`orca-ide skills get orchestration`), use this one for **what to launch and how to accept it**.

## Use the right executable

On Linux use `orca-ide`, never bare `orca` (it resolves to the GNOME screen reader and starts speech). If `orca-ide` cannot run, report its exact error and stop. Coordination needs real Orca runtime state: never substitute a non-Orca subagent tool when the user asked for Orca.

## 1. Classify and plan

1. `orca-ide status --json`; if Orca is not running, `orca-ide open --json` (or `orca-ide serve` for a window-less runtime when the machine is loaded).
2. `orca-ide orchestration run-create --objective "<objective>" --json`.
3. Pick the preset that fits and print its plan:

```bash
~/.ecc-shared/bin/ecc-spec --preset <feature|bug|ui|video|research|content> --plan [--lang python|django|fastapi|react|next|ts|go|rust]
```

The plan lists stages, agents, worktrees, dependencies and **waves** (the order they may launch in). No preset fits: choose skills yourself with `ecc-spec --auto --task "..."` or the routing table in `ECC.md`.

## 2. Launch a wave

Per stage, one worker. The spec **must** come from `ecc-spec` (a hook denies `worker-start --spec` without a skill assignment):

```bash
orca-ide orchestration worker-start --run <RUN_ID> --agent claude --worktree <current|new-child> --json \
  --spec "$(~/.ecc-shared/bin/ecc-spec --preset feature --stage implement --lang django --task '<TAREA>' --context '<resumen de la etapa previa>')"
```

- Launch every stage of a wave before waiting. Respect `maxParallel` (default 2) and run `exclusive` stages (video renders) alone.
- Outside an Orca terminal pass `--from <coordinator_handle>`.
- Pass `--model`/`--effort` only when the user named one.
- Use `new-child` for stages that edit files, `current` for read-only ones. Never start two editing workers in the same worktree.
- If `worker-start` fails, do not relaunch: read `failedStage` and `residualResources`, then follow Orca's recovery reference.

## 3. Wait without polling

```bash
orca-ide orchestration check --terminal <coordinator_handle> --wait --types worker_done,escalation,question --timeout-ms 900000 --json
```

An empty wait or timeout is a checkpoint, not a failure: keep waiting. Process the whole batch before `--ack`. Answer a worker's `ask` with `reply`; use `gate-create` only for a decision that belongs to the task DAG.

## 4. Accept each `worker_done`

1. `worker-read --dispatch <id> --json` and confirm the line `ECC-SKILLS-APPLIED: <skills> — <evidence>` names every required skill. If missing: `send --to dispatch:<id>` asking for it.
2. An implementation stage is accepted only after the next stage reviews it (`requesting-code-review`, `security-review`). **You synthesize; you do not edit the worker's files** unless the user assigned that to you.
3. Feed the accepted summary into the next stage with `--context`.
4. Decide each worker's next owner before `--ack`: reuse the same terminal for immediate follow-up, `worker-retain` for debugging, otherwise `worker-release`.

## 5. Close

Run `verification-loop` (build + tests), then report per task: result, evidence, unresolved blockers. Clean up with `worker-release`/`worker-stop` and `worker-list --run <RUN_ID>`.

## Safety rules (from Orca)

- Stop, abandon or retry only with **positive proof** the agent exited (`exited` liveness, or a final turn with no `worker_done`). `unverifiable` (missing status, lost contact) authorizes nothing.
- A live PTY can hold a dead agent: `worker-list`'s `projection.liveness` decides, not `worker-show`'s terminal status.
- Heartbeats and visible activity mean alive, not done.
- A review-only `worker_done` authorizes synthesis, not coordinator edits.

## Machine load

Orca with many terminals saturates the PC. Default to 2 parallel workers, never run a video render next to other workers, and prefer `orca-ide serve` for large waves.

## Related skills

`orchestration` (Orca's CLI contract), `dispatching-parallel-agents`, `subagent-driven-development`, `requesting-code-review`, `verification-loop`.
