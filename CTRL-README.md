# CTRL — Capability Reference (for Claude, via MCP)

This document is for **Claude**, not a human reader. It's the self-contained answer to
"what can I do with CTRL and how," callable fresh in any chat via the `get_readme` tool —
regardless of which project or session you're in, and with no assumption you've seen prior
conversations about CTRL.

If you haven't called `get_readme` yet this session and the user asks you to do anything
with CTRL, call it first.

This doc does **not** cover how CTRL is built, deployed, or debugged (tokens, Vercel, Turso
internals, past incidents) — that's a separate build-only briefing used in dedicated CTRL
dev sessions. This doc is capabilities and conventions only.

---

## What CTRL is

CTRL is Ian's personal task and time management tool, used daily for business development,
content/podcast production, and client work, plus general personal task tracking. It's
organized as multiple **boards**, each with its own **statuses** (columns), holding **tasks**
that can carry a **label**, schedule/due dates, priority, duration, and optional links to
external systems (e.g. a CRM contact or an external task ID).

---

## Data model

**Boards** — top-level containers (e.g. "Tasks" / `main`, "Dev" / `board-...`). Each board has
its own ordered list of statuses (its own workflow columns) and its own tasks. Labels are
currently global across all boards, not board-specific.

**Statuses** — per-board workflow stages. The default board's statuses are Backlog, Scheduled,
Today, In Progress, Blocked, Done. Other boards may define a different set — always check
`get_boards` rather than assuming a fixed status list.

**Tasks** — the core unit. Key fields: `title`, `notes`, `status`, `priority`
(High/Medium/Low), `duration` (minutes), `label`, `scheduled_on`, `due`, `recurring`,
`board_id`, plus optional `crm_contact_id` / `external_system` / `external_task_id` for
linking to outside systems.

**Labels** — a flat, global tag list used for filtering and categorization.

---

## Tools available

| Tool | Purpose |
|---|---|
| `get_now` | Current date/time/day from the server. Call at the start of any scheduling or planning conversation — don't assume the date. |
| `get_boards` | List all boards with their id, name, and statuses. Call this before referencing a board by name, or when you don't already know what boards exist. |
| `get_tasks` | Fetch tasks with filters: `board_id` (id, name, or `"all"` for cross-board — see conventions below), `status`, `label`, `scheduled_on`/`scheduled_from`/`scheduled_to`, `limit`. |
| `add_task` | Create a task. Defaults: `board_id` → main board, `status` → backlog. |
| `update_task` | Update a task by id — only the fields you pass change. Can move a task between boards via `board_id`. |
| `delete_task` | Delete a task by id. |
| `find_task_by_external_id` | Look up a task by `external_system` + `external_task_id` (e.g. a linked HubSpot or Asana record). |
| `find_tasks_by_crm_contact` | All tasks linked to a given CRM contact id. |
| `create_board` | Create a new board. |
| `get_labels` / `add_label` / `delete_label` | Manage the global label list. |
| `get_plan` / `save_plan` / `list_plans` | Read/write/list markdown plan files (daily, weekly, reflections). |

---

## Conventions

- **Resolve board identity before filtering.** Call `get_boards` before filtering by board
  name, or whenever you don't already know the current board list this session — don't guess
  an ID.
- **`board_id` accepts an ID, a name, or `"all"`** (case-insensitive) for a cross-board query.
  `"all"` applies `limit` globally across all boards combined, not per-board.
- **Call `get_now` at the start of any scheduling/planning task** — never assume today's date.
- **Recommended daily check-in pattern:**
  ```
  get_now()
  get_tasks({ board_id: "main", status: "today,doing,blocked" })
  ```
- **Don't assume a fixed status list** — different boards can define different statuses; check
  `get_boards` rather than hardcoding Backlog/Today/Doing/etc.
- **This document can go stale.** If something you're told about CTRL in conversation
  contradicts this doc, trust the conversation for that session, but flag the mismatch —
  it likely means this README needs an update.

---

## Maintenance note (for whoever is building CTRL, human or Claude)

Whenever a change ships that affects any tool's behavior, parameters, or a convention above,
update this file in the same session. This doc is only useful if it stays current — treat
it with the same discipline as the app's version bump on deploy.
