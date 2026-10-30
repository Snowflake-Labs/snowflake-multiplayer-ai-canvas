# Agent Canvas: Multiplayer AI in Snowflake

A data team and Gil in the same canvas, sharing a single agent session, in real time – **all in Snowflake right next to the data.** Everyone in the canvas can see every message written by teammates or Gil, every tool call, every chart. Mention `@Gil` to bring the agent into the thread. Type `/file` to capture durable context the team can revisit across new sessions.

## Prerequisites

- A Snowflake account with Cortex Agents enabled
- The [Snowflake CLI](https://docs.snowflake.com/en/developer-guide/snowflake-cli-v2/index) (`snow`)
- Node.js 22+
- A connection configured in `snow` (`snow connection add`)

## Setup

Four commands.

```sh
# 1. Clone the repo and enter it.
git clone https://github.com/Snowflake-Labs/snowflake-multiplayer-ai-canvas.git
cd snowflake-multiplayer-ai-canvas

# 2. Create every Snowflake object the app needs (database, warehouse, role,
#    semantic view over TPC-H, Cortex Agent with 5 tools, grants).
snow sql -f setup.sql

# 3. Deploy the app to Snowflake App Runtime.
snow app deploy

# 4. Open the URL printed by `snow app deploy`.
```

Once you log in, use the **Invite others** button in the app to share the link with teammates. Each teammate opens the link and logs in with their own Snowflake credentials.

## What's in the app

- **One canvas** at `/canvas`. Share the URL to pull teammates in. Think of it as a live, shared agentic workspace.

- **One agent, Gil**, with five tools:
  - `tpch_analyst` – text-to-SQL over a semantic view on TPC-H sample data
  - `docs_search` – Snowflake documentation via a Cortex Knowledge Extension
  - `data_to_chart` – Vega-Lite charts from numeric results
  - `web_search` – anything outside the above
  - `get_filings` – reads the canvas's durable context log
  
- **Two-layer memory**:
  - Thread (per-session, resets when you click **New session**)
  - Filings (durable, team-curated via `/file`, survive across sessions)

- **One easter egg.** Try the Konami code (↑ ↑ ↓ ↓ ← → ← → B A) anywhere outside the message box.

## Filing context with `/file`

Threads reset when you click **New session**; filings survive. Use `/file` to pin durable context the team can revisit across sessions.

- `/file <text>` – file a note inline.
- `/file` – open a prompt sheet and write the context yourself.
- `/file` → **Let Gil write it** – the agent summarizes everything since the last filing.

Filings land in `AGENT_CANVAS.PUBLIC.CANVAS_CONTEXT`. Gil reads them back through the `get_filings` tool when anyone asks about team history, or when someone clicks **Load prior context** to prime a new session.

## Exercises – Try these with CoCo

Navigate to the repo root and start a new CoCo session. Try one (or all) of the following by prompting CoCo:

- **Swap the data domain.** Point `tpch_analyst` at your own semantic view and rewrite the agent's response instructions to speak the language of your business.

- **Give Gil a new identity.** Rename the agent, rewrite the orchestration prompt, change the `@mention` regex, and swap the starter prompts in `EmptyState.tsx`. The agent should sound like a specialist on your team.

- **Make filings searchable.** Stand up a Cortex Search service on `CANVAS_CONTEXT`, register it as a new tool, and promote filings from a per-canvas log into semantic team memory that spans every canvas.

- **Open the app to multiple canvases.** Add a landing page that lists canvases, let users create new ones, scope tools per canvas. The architecture is already wired; this is UX work.

- **Add a write tool with human-in-the-loop approval.** Register a tool that can insert or merge. Gate it so the proposed action shows up as a card in the canvas and only runs when a teammate clicks approve. Gil becomes a collaborator that can write to your Snowflake.

- **Add a second agent.** Register another agent in `setup.sql`, give it its own tools and persona, and route `@SpecialistName` to it in the send handler. Two agents collaborating with your team is a different app.

## Debugging

The canvas shows a generic error if something fails mid-turn. Full detail lives in the service logs:

- **Snowsight** – Projects → Apps → `AGENT_CANVAS_APP` → **Logs**
- **CLI** – `snow spcs service logs AGENT_CANVAS_APP --container-name app`

## Known limits

- One canvas (`main`) in the stock app. Multi-canvas is wired architecturally; see `src/app/canvas/[id]/page.tsx` to extend.
- One SPCS instance (`max_instances: 1`). The in-memory canvas bus assumes a single container. Multi-replica would need a durable channel.
- Thread history grows unbounded until **New session** is clicked. The two-layer design intentionally keeps durable memory in filings; the thread stays scoped to the current session.

## How it's organized

```
snowflake-multiplayer-ai-canvas/
├── setup.sql               # Every Snowflake object, idempotent
├── app.yml                 # SPCS service manifest
├── AGENTS.md               # Context for CoCo when you tailor
└── src/
    ├── app/
    │   ├── canvas/[id]/        # The shared canvas page + SSE stream
    │   └── api/canvas/[id]/    # send, file, stream, new-session, load-context
    ├── components/        # UI (MessageBubble, ToolCard, ChartCard, FilingCard, …)
    └── lib/               # agent, auth, canvas-store, canvas-bus, theme
```

## License

Apache 2.0. Clone it, remix it, ship it.
