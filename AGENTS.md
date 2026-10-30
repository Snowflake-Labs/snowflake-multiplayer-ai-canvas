# Agent Canvas – context for CoCo

A multiplayer Agent Canvas app deployed to Snowflake App Runtime. A team and Gil share one canvas, in real time, over SSE. Mention `@Gil` to invoke the agent. Type `/file` to pin durable context the team can revisit across sessions.

Readers typically land here to tailor the app for their own team or data. Help them do that quickly. Use the file pointers below instead of grepping.

## Mental model

- **Canvas** – the shared workspace. One canvas per URL (`/canvas/<id>`). The stock app only uses `main`.
- **Session** – one chat thread inside a canvas. **New session** starts a fresh thread. Multiple sessions can exist in the same canvas over time.
- **Thread** – the working memory the agent sees. Scoped to the current session.
- **Filing** – a durable, team-curated note. Lives in `AGENT_CANVAS.PUBLIC.CANVAS_CONTEXT`. Survives **New session**.
- **Two-layer memory**: thread (per-session, auto) + filings (across-session, team-curated via `/file`).

A new session is the same canvas with a fresh thread. Do not conflate the two.

## Where things live

- `setup.sql` – idempotent. Creates database, schemas, role, warehouse, `CANVASES` + `CANVAS_CONTEXT` tables, `TPCH_REV_SV` semantic view, `GET_FILINGS` UDF, the `CANVAS_AGENT` Cortex Agent with five tools, grants.
- `app.yml` – SPCS service manifest. `max_instances: 1`.
- `src/app/canvas/[id]/page.tsx` + `ChatClient.tsx` – canvas page, SSE stream dispatch to render cards.
- `src/app/api/canvas/[id]/` – API routes: `send`, `file`, `stream`, `new-session`, `prior-sessions`, `load-context`.
- `src/components/` – `MessageBubble`, `ToolCard`, `ChartCard`, `FilingCard`, `PriorSessionsMenu`, `CanvasHeader`, `Composer`, `EmptyState`.
- `src/lib/` – `agent` (SDK wrapper), `auth`, `canvas-store` (SQL helpers), `canvas-bus` (in-memory pub/sub), `theme`.

## Deploy loop

- Any change to the agent spec, tool list, UDF, or table schema → `snow sql -f setup.sql` (idempotent).
- Any code change → `snow app deploy`.
- Both commands run from the repo root.

## Debugging

The canvas renders a generic error on turn failure (by design). Full detail is in the service logs:

- Snowsight: Projects → Apps → `AGENT_CANVAS_APP` → **Logs**
- CLI: `snow spcs service logs AGENT_CANVAS_APP --container-name app`

Server-side `console.error` captures `message`, `code`, `cause`, and `stack` on every turn error.

## The agent

Lives at `AGENT_CANVAS.AGENTS.CANVAS_AGENT`. Five tools:

1. `tpch_analyst` – text-to-SQL over `TPCH_REV_SV`.
2. `docs_search` – Cortex Search over Snowflake docs (CKE from Marketplace listing `GZSTZ67BY9OQ4`).
3. `data_to_chart` – returns a Vega-Lite spec from tabular results.
4. `web_search` – general web.
5. `get_filings(canvas_id STRING) RETURNS ARRAY` – reads the canvas's filing log.

`@Gil` is matched by a regex in `src/app/api/canvas/[id]/send/route.ts`. Renaming the agent means updating both the agent `display_name` in `setup.sql` and the regex here.

## Common tailoring moves

### Swap the data domain

1. Replace `TPCH_REV_SV` DDL in `setup.sql` with the user's semantic view.
2. Update `tpch_analyst`'s `tool_spec.input_schema` description in the agent block.
3. Rewrite `instructions.response` to speak the user's business language.
4. Re-run `snow sql -f setup.sql`.
5. If the starter prompts in `src/components/EmptyState.tsx` still reference TPC-H, update them.

### Rename the agent (Gil → YourAgent)

1. Change `display_name` in the `CREATE AGENT` block in `setup.sql`.
2. Change the `@Gil` regex in `src/app/api/canvas/[id]/send/route.ts`.
3. Update the UI copy in `src/components/Composer.tsx` and `src/components/EmptyState.tsx`.
4. Re-run `snow sql -f setup.sql` and `snow app deploy`.

### Add a new tool

1. Register it in `setup.sql`: add to `tools:` and `tool_resources:` in the `CREATE AGENT` block.
2. If the result shape is new, add a render card in `src/components/` and a dispatch branch in `src/app/canvas/[id]/ChatClient.tsx`.
3. Re-run `snow sql -f setup.sql` and `snow app deploy`.

### Change orchestration

Edit `instructions.orchestration` in the agent spec in `setup.sql`. Re-run `snow sql -f setup.sql`; no code change needed.

## When unsure

Point readers at `README.md` for setup and the exercise list. Point them at `setup.sql` for the source of truth on every Snowflake object.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
