const REPO = 'vb-iant/time-manager';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main`;
const API_BASE = `https://api.github.com/repos/${REPO}/contents`;
async function turso(sql, args = []) {
  const TURSO_URL = (process.env.TURSO_URL || '').replace('libsql://', 'https://');
  const TURSO_TOKEN = process.env.TURSO_TOKEN;
  const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TURSO_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [
      { type: 'execute', stmt: { sql, args: args.map(v => {
        if (v === null) return { type: 'null' };
        if (typeof v === 'number') return { type: 'integer', value: String(v) };
        return { type: 'text', value: String(v) };
      })}},
      { type: 'close' }
    ]})
  });
  const data = await res.json();
  if (data.results?.[0]?.type === 'error') throw new Error(data.results[0].error.message);
  return data.results?.[0]?.response?.result;
}

function rowToTask(cols, row) {
  const obj = {};
  cols.forEach((col, i) => {
    const val = row[i];
    if (val.type === 'null') obj[col.name] = null;
    else if (col.name === 'recurring') obj[col.name] = val.value === '1' || val.value === 1;
    else if (col.name === 'duration') obj[col.name] = val.value ? parseInt(val.value) : null;
    else obj[col.name] = val.value;
  });
  return obj;
}

async function githubRead(path) {
  const res = await fetch(`${RAW_BASE}/${path}?t=${Date.now()}`);
  if (!res.ok) throw new Error(`Not found: ${path}`);
  return res.text();
}

async function githubWrite(path, content) {
  const TOKEN = process.env.GITHUB_TOKEN;
  const api = `${API_BASE}/${path}`;
  let sha;
  const check = await fetch(api, { headers: { Authorization: `token ${TOKEN}` } });
  if (check.ok) sha = (await check.json()).sha;
  const encoded = btoa(unescape(encodeURIComponent(content)));
  const body = { message: `MCP update: ${path}`, content: encoded };
  if (sha) body.sha = sha;
  const res = await fetch(api, {
    method: 'PUT',
    headers: { Authorization: `token ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!data.content) throw new Error(data.message || 'Write failed');
  return data.content.sha;
}

const TOOLS = [
  { name: 'get_now', description: 'Get the current date, time and day of week from the server', inputSchema: { type: 'object', properties: {}, required: [] } },
  { name: 'get_tasks', description: 'Get tasks from CTRL with optional filters. Use filters to reduce data — avoid fetching all tasks unless necessary.', inputSchema: { type: 'object', properties: {
    board_id: { type: 'string', description: 'Filter by board ID e.g. "main". Defaults to "main" if not specified.' },
    status: { type: 'string', description: 'Filter by status or comma-separated statuses e.g. "today" or "today,doing,blocked"' },
    label: { type: 'string', description: 'Filter by label e.g. "Business Development"' },
    scheduled_on: { type: 'string', description: 'Filter by exact scheduled date YYYY-MM-DD' },
    scheduled_from: { type: 'string', description: 'Filter tasks scheduled on or after this date YYYY-MM-DD' },
    scheduled_to: { type: 'string', description: 'Filter tasks scheduled on or before this date YYYY-MM-DD' },
    limit: { type: 'number', description: 'Max number of tasks to return (default 100)' }
  }, required: [] } },
  { name: 'add_task', description: 'Add a single new task', inputSchema: { type: 'object', properties: {
    title: { type: 'string' }, notes: { type: 'string' },
    status: { type: 'string', description: 'backlog | scheduled | today | doing | blocked | done. Defaults to backlog.' },
    priority: { type: 'string', description: 'High | Medium | Low' },
    duration: { type: 'number', description: 'Minutes' },
    label: { type: 'string' }, scheduled_on: { type: 'string', description: 'YYYY-MM-DD' },
    due: { type: 'string', description: 'YYYY-MM-DD' }, recurring: { type: 'boolean' },
    crm_contact_id: { type: 'string' }, external_system: { type: 'string' }, external_task_id: { type: 'string' },
    board_id: { type: 'string', description: 'Board to add task to, defaults to main' }
  }, required: ['title'] }},
  { name: 'update_task', description: 'Update a single task by id — only fields provided will change', inputSchema: { type: 'object', properties: {
    id: { type: 'string' }, title: { type: 'string' }, notes: { type: 'string' },
    status: { type: 'string' }, priority: { type: 'string' }, duration: { type: 'number' },
    label: { type: 'string' }, scheduled_on: { type: 'string' }, due: { type: 'string' },
    recurring: { type: 'boolean' }, crm_contact_id: { type: 'string' },
    external_system: { type: 'string' }, external_task_id: { type: 'string' }
  }, required: ['id'] }},
  { name: 'delete_task', description: 'Delete a task by id', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }},
  { name: 'find_task_by_external_id', description: 'Find a CTRL task by external system and task ID. Returns task or null.', inputSchema: { type: 'object', properties: { external_system: { type: 'string' }, external_task_id: { type: 'string' } }, required: ['external_system', 'external_task_id'] }},
  { name: 'find_tasks_by_crm_contact', description: 'Find all CTRL tasks linked to a CRM contact ID', inputSchema: { type: 'object', properties: { crm_contact_id: { type: 'string' } }, required: ['crm_contact_id'] }},
  { name: 'get_boards', description: 'Get all boards', inputSchema: { type: 'object', properties: {}, required: [] } },
  { name: 'create_board', description: 'Create a new board', inputSchema: { type: 'object', properties: {
    name: { type: 'string', description: 'Board name' },
    label: { type: 'string', description: 'Optional label to filter tasks for this board' }
  }, required: ['name'] } },
  { name: 'get_labels', description: 'Get all task labels', inputSchema: { type: 'object', properties: {}, required: [] }},
  { name: 'add_label', description: 'Add a new label', inputSchema: { type: 'object', properties: { label: { type: 'string' } }, required: ['label'] }},
  { name: 'delete_label', description: 'Delete a label', inputSchema: { type: 'object', properties: { label: { type: 'string' } }, required: ['label'] }},
  { name: 'get_plan', description: 'Read a daily plan, weekly plan or reflection file', inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'e.g. daily/2026-06-25.md' } }, required: ['path'] }},
  { name: 'save_plan', description: 'Write a daily plan, weekly plan or reflection markdown file', inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] }},
  { name: 'list_plans', description: 'List available plan files in a folder', inputSchema: { type: 'object', properties: { folder: { type: 'string', description: 'daily | weekly | reflections' } }, required: ['folder'] }}
];

async function callTool(name, args) {
  const now = new Date().toISOString();

  if (name === 'get_now') {
    const now = new Date();
    return JSON.stringify({
      iso: now.toISOString(),
      date: now.toISOString().slice(0, 10),
      time: now.toTimeString().slice(0, 8),
      day: now.toLocaleDateString('en-GB', { weekday: 'long' }),
      datetime: now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' ' + now.toTimeString().slice(0, 5) + ' UTC'
    });
  }
  if (name === 'get_tasks') {
    const conditions = [];
    const params = [];

    // Default to main board
    conditions.push('board_id = ?');
    params.push(args.board_id || 'main');

    if (args.status) {
      const statuses = args.status.split(',').map(s => s.trim());
      if (statuses.length === 1) {
        conditions.push('status = ?');
        params.push(statuses[0]);
      } else {
        conditions.push(`status IN (${statuses.map(() => '?').join(',')})`);
        params.push(...statuses);
      }
    }
    if (args.label) {
      conditions.push('label = ?');
      params.push(args.label);
    }
    if (args.scheduled_on) {
      conditions.push('scheduled_on = ?');
      params.push(args.scheduled_on);
    }
    if (args.scheduled_from) {
      conditions.push('scheduled_on >= ?');
      params.push(args.scheduled_from);
    }
    if (args.scheduled_to) {
      conditions.push('scheduled_on <= ?');
      params.push(args.scheduled_to);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = args.limit ? `LIMIT ${parseInt(args.limit)}` : 'LIMIT 100';
    const sql = `SELECT * FROM tasks ${where} ORDER BY created DESC ${limit}`;

    const result = await turso(sql, params);
    const tasks = result.rows.map(row => rowToTask(result.cols, row));
    return JSON.stringify({ version: '1.0', tasks, count: tasks.length, filtered: conditions.length > 0 }, null, 2);
  }

  if (name === 'add_task') {
    const id = 'tm-' + Date.now();
    await turso(
      'INSERT INTO tasks (id, title, notes, status, priority, duration, label, scheduled_on, due, recurring, crm_contact_id, external_system, external_task_id, board_id, created, updated, status_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, args.title, args.notes||null, args.status||'backlog', args.priority||null, args.duration||null, args.label||null, args.scheduled_on||null, args.due||null, args.recurring?1:0, args.crm_contact_id||null, args.external_system||null, args.external_task_id||null, args.board_id||'main', now, now, now]
    );
    return `Task added: "${args.title}" (id: ${id})`;
  }

  if (name === 'update_task') {
    const existing = await turso('SELECT * FROM tasks WHERE id = ?', [args.id]);
    if (!existing.rows.length) throw new Error(`Task not found: ${args.id}`);
    const task = rowToTask(existing.cols, existing.rows[0]);
    const prevStatus = task.status;

    const fields = ['title', 'notes', 'priority', 'duration', 'label', 'scheduled_on', 'due', 'crm_contact_id', 'external_system', 'external_task_id'];
    const updates = ['updated = ?'];
    const values = [now];
    for (const f of fields) {
      if (args[f] !== undefined) { updates.push(`${f} = ?`); values.push(args[f]); }
    }
    if (args.status !== undefined) {
      updates.push('status = ?'); values.push(args.status || 'backlog');
      if (args.status !== prevStatus) { updates.push('status_updated = ?'); values.push(now); }
    }
    if (args.recurring !== undefined) { updates.push('recurring = ?'); values.push(args.recurring ? 1 : 0); }
    values.push(args.id);
    await turso(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, values);

    if (args.status === 'done' && prevStatus !== 'done' && task.recurring) {
      const base = task.scheduled_on || now.slice(0, 10);
      const next = new Date(base + 'T12:00:00');
      next.setDate(next.getDate() + 7);
      const nextDate = next.toISOString().slice(0, 10);
      await turso(
        "INSERT INTO tasks (id, title, notes, status, priority, duration, label, scheduled_on, due, recurring, crm_contact_id, external_system, external_task_id, created, updated, status_updated) VALUES (?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)",
        ['tm-' + Date.now(), task.title, task.notes, task.priority, task.duration, task.label, nextDate, task.due ? nextDate : null, task.crm_contact_id, task.external_system, task.external_task_id, now, now, now]
      );
    }
    const updated = await turso('SELECT title FROM tasks WHERE id = ?', [args.id]);
    return `Task updated: "${updated.rows[0][0].value}" (id: ${args.id})`;
  }

  if (name === 'delete_task') {
    const existing = await turso('SELECT title FROM tasks WHERE id = ?', [args.id]);
    if (!existing.rows.length) throw new Error(`Task not found: ${args.id}`);
    const title = existing.rows[0][0].value;
    await turso('DELETE FROM tasks WHERE id = ?', [args.id]);
    return `Task deleted: "${title}" (id: ${args.id})`;
  }

  if (name === 'find_task_by_external_id') {
    const result = await turso('SELECT * FROM tasks WHERE external_system = ? AND external_task_id = ? LIMIT 1', [args.external_system, args.external_task_id]);
    return result.rows.length ? JSON.stringify(rowToTask(result.cols, result.rows[0]), null, 2) : 'null';
  }

  if (name === 'find_tasks_by_crm_contact') {
    const result = await turso('SELECT * FROM tasks WHERE crm_contact_id = ?', [args.crm_contact_id]);
    return JSON.stringify(result.rows.map(row => rowToTask(result.cols, row)), null, 2);
  }

  if (name === 'get_boards') {
    const result = await turso('SELECT * FROM boards ORDER BY created ASC');
    const boards = result.rows.map(row => rowToTask(result.cols, row));
    // Get statuses for each board
    const statusResult = await turso('SELECT * FROM board_statuses ORDER BY board_id, position ASC');
    const statuses = statusResult.rows.map(row => rowToTask(statusResult.cols, row));
    boards.forEach(b => { b.statuses = statuses.filter(s => s.board_id === b.id); });
    return JSON.stringify(boards, null, 2);
  }

  if (name === 'create_board') {
    const id = 'board-' + Date.now();
    const now = new Date().toISOString();
    await turso('INSERT INTO boards (id, name, created) VALUES (?, ?, ?)', [id, args.name, now]);
    // Clone default statuses from main board
    const defaultStatuses = ['backlog', 'doing', 'done'];
    const statusNames = { backlog: 'Backlog', doing: 'In Progress', done: 'Done' };
    for (let i = 0; i < defaultStatuses.length; i++) {
      const slug = defaultStatuses[i];
      await turso('INSERT INTO board_statuses (id, board_id, name, slug, position) VALUES (?, ?, ?, ?, ?)',
        [`${id}-${slug}`, id, statusNames[slug], slug, i]);
    }
    return `Board created: "${args.name}" (id: ${id})`;
  }

  if (name === 'get_labels') {
    const result = await turso('SELECT name FROM labels ORDER BY name');
    return JSON.stringify({ labels: result.rows.map(r => r[0].value) }, null, 2);
  }

  if (name === 'add_label') {
    await turso('INSERT OR IGNORE INTO labels (name) VALUES (?)', [args.label]);
    return `Label added: "${args.label}"`;
  }

  if (name === 'delete_label') {
    await turso('DELETE FROM labels WHERE name = ?', [args.label]);
    return `Label deleted: "${args.label}"`;
  }

  if (name === 'get_plan') {
    return await githubRead(args.path);
  }

  if (name === 'save_plan') {
    const allowed = ['daily/', 'weekly/', 'reflections/'];
    if (!allowed.some(p => args.path.startsWith(p))) throw new Error('Path not permitted');
    await githubWrite(args.path, args.content);
    return `Saved ${args.path}`;
  }

  if (name === 'list_plans') {
    const TOKEN = process.env.GITHUB_TOKEN;
    const res = await fetch(`${API_BASE}/${args.folder}`, { headers: { Authorization: `token ${TOKEN}` } });
    if (!res.ok) return 'No files found.';
    const files = await res.json();
    return files.filter(f => f.name.endsWith('.md')).map(f => f.name).sort().reverse().join('\n');
  }

  throw new Error(`Unknown tool: ${name}`);
}

export default async function handler(req) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
    'Content-Type': 'application/json'
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers });
  if (req.method === 'GET') return new Response(JSON.stringify({ status: 'ok', store: 'turso' }), { headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });

  let body;
  try { body = await req.json(); } catch(e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers });
  }

  const { method, params, id } = body;

  if (method === 'notifications/initialized') return new Response(null, { status: 202, headers });

  if (method === 'initialize') {
    return new Response(JSON.stringify({
      jsonrpc: '2.0', id,
      result: { protocolVersion: '2025-03-26', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'ctrl', version: '2.0.0' } }
    }), { headers });
  }

  if (method === 'tools/list') {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { tools: TOOLS } }), { headers });
  }

  if (method === 'tools/call') {
    try {
      const result = await callTool(params.name, params.arguments || {});
      return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: result }] } }), { headers });
    } catch(e) {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message: e.message } }), { headers });
    }
  }

  return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } }), { status: 404, headers });
}

export const config = { runtime: 'edge' };
