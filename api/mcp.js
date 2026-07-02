import { createClient } from '@libsql/client';

const REPO = 'vb-iant/time-manager';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main`;
const API_BASE = `https://api.github.com/repos/${REPO}/contents`;

function getDb() {
  return createClient({
    url: process.env.TURSO_URL,
    authToken: process.env.TURSO_TOKEN,
  });
}

function taskFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes || null,
    status: row.status || 'backlog',
    priority: row.priority || null,
    duration: row.duration || null,
    label: row.label || null,
    scheduled_on: row.scheduled_on || null,
    due: row.due || null,
    recurring: row.recurring === 1 || row.recurring === true,
    crm_contact_id: row.crm_contact_id || null,
    external_system: row.external_system || null,
    external_task_id: row.external_task_id || null,
    created: row.created,
    updated: row.updated,
    status_updated: row.status_updated || null,
  };
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
  {
    name: 'get_tasks',
    description: 'Get all current tasks from CTRL',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'add_task',
    description: 'Add a single new task',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        notes: { type: 'string' },
        status: { type: 'string', description: 'backlog | scheduled | today | doing | blocked | done. Defaults to backlog.' },
        priority: { type: 'string', description: 'High | Medium | Low' },
        duration: { type: 'number', description: 'Minutes' },
        label: { type: 'string' },
        scheduled_on: { type: 'string', description: 'YYYY-MM-DD' },
        due: { type: 'string', description: 'YYYY-MM-DD' },
        recurring: { type: 'boolean' },
        crm_contact_id: { type: 'string' },
        external_system: { type: 'string' },
        external_task_id: { type: 'string' }
      },
      required: ['title']
    }
  },
  {
    name: 'update_task',
    description: 'Update a single task by id — only fields provided will change',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        notes: { type: 'string' },
        status: { type: 'string' },
        priority: { type: 'string' },
        duration: { type: 'number' },
        label: { type: 'string' },
        scheduled_on: { type: 'string' },
        due: { type: 'string' },
        recurring: { type: 'boolean' },
        crm_contact_id: { type: 'string' },
        external_system: { type: 'string' },
        external_task_id: { type: 'string' }
      },
      required: ['id']
    }
  },
  {
    name: 'delete_task',
    description: 'Delete a task by id',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id']
    }
  },
  {
    name: 'find_task_by_external_id',
    description: 'Find a CTRL task linked to an external system by its external task ID. Returns the task or null. Use before creating from external sync to avoid duplicates.',
    inputSchema: {
      type: 'object',
      properties: {
        external_system: { type: 'string' },
        external_task_id: { type: 'string' }
      },
      required: ['external_system', 'external_task_id']
    }
  },
  {
    name: 'find_tasks_by_crm_contact',
    description: 'Find all CTRL tasks linked to a CRM contact ID',
    inputSchema: {
      type: 'object',
      properties: { crm_contact_id: { type: 'string' } },
      required: ['crm_contact_id']
    }
  },
  {
    name: 'get_labels',
    description: 'Get all task labels',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'add_label',
    description: 'Add a new label',
    inputSchema: {
      type: 'object',
      properties: { label: { type: 'string' } },
      required: ['label']
    }
  },
  {
    name: 'delete_label',
    description: 'Delete a label',
    inputSchema: {
      type: 'object',
      properties: { label: { type: 'string' } },
      required: ['label']
    }
  },
  {
    name: 'get_plan',
    description: 'Read a daily plan, weekly plan or reflection file',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'e.g. daily/2026-06-25.md' } },
      required: ['path']
    }
  },
  {
    name: 'save_plan',
    description: 'Write a daily plan, weekly plan or reflection markdown file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'list_plans',
    description: 'List available plan files in a folder',
    inputSchema: {
      type: 'object',
      properties: { folder: { type: 'string', description: 'daily | weekly | reflections' } },
      required: ['folder']
    }
  }
];

async function callTool(name, args) {
  const db = getDb();
  const now = new Date().toISOString();

  if (name === 'get_tasks') {
    const result = await db.execute('SELECT * FROM tasks ORDER BY created DESC');
    const tasks = result.rows.map(taskFromRow);
    return JSON.stringify({ version: '1.0', tasks }, null, 2);
  }

  if (name === 'add_task') {
    const id = 'tm-' + Date.now();
    await db.execute({
      sql: `INSERT INTO tasks (id, title, notes, status, priority, duration, label, scheduled_on, due, recurring, crm_contact_id, external_system, external_task_id, created, updated, status_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, args.title, args.notes || null, args.status || 'backlog', args.priority || null, args.duration || null, args.label || null, args.scheduled_on || null, args.due || null, args.recurring ? 1 : 0, args.crm_contact_id || null, args.external_system || null, args.external_task_id || null, now, now, now]
    });
    return `Task added: "${args.title}" (id: ${id})`;
  }

  if (name === 'update_task') {
    const existing = await db.execute({ sql: 'SELECT * FROM tasks WHERE id = ?', args: [args.id] });
    if (!existing.rows.length) throw new Error(`Task not found: ${args.id}`);
    const task = existing.rows[0];
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
    await db.execute({ sql: `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, args: values });

    // Handle recurring task completion
    if (args.status === 'done' && prevStatus !== 'done' && task.recurring) {
      const base = task.scheduled_on || now.slice(0, 10);
      const next = new Date(base + 'T12:00:00');
      next.setDate(next.getDate() + 7);
      const nextDate = next.toISOString().slice(0, 10);
      await db.execute({
        sql: `INSERT INTO tasks (id, title, notes, status, priority, duration, label, scheduled_on, due, recurring, crm_contact_id, external_system, external_task_id, created, updated, status_updated) VALUES (?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
        args: ['tm-' + Date.now(), task.title, task.notes, task.priority, task.duration, task.label, nextDate, task.due ? nextDate : null, task.crm_contact_id, task.external_system, task.external_task_id, now, now, now]
      });
    }

    const updated = await db.execute({ sql: 'SELECT * FROM tasks WHERE id = ?', args: [args.id] });
    return `Task updated: "${updated.rows[0].title}" (id: ${args.id})`;
  }

  if (name === 'delete_task') {
    const existing = await db.execute({ sql: 'SELECT title FROM tasks WHERE id = ?', args: [args.id] });
    if (!existing.rows.length) throw new Error(`Task not found: ${args.id}`);
    await db.execute({ sql: 'DELETE FROM tasks WHERE id = ?', args: [args.id] });
    return `Task deleted: "${existing.rows[0].title}" (id: ${args.id})`;
  }

  if (name === 'find_task_by_external_id') {
    const result = await db.execute({
      sql: 'SELECT * FROM tasks WHERE external_system = ? AND external_task_id = ? LIMIT 1',
      args: [args.external_system, args.external_task_id]
    });
    return result.rows.length ? JSON.stringify(taskFromRow(result.rows[0]), null, 2) : 'null';
  }

  if (name === 'find_tasks_by_crm_contact') {
    const result = await db.execute({
      sql: 'SELECT * FROM tasks WHERE crm_contact_id = ?',
      args: [args.crm_contact_id]
    });
    return JSON.stringify(result.rows.map(taskFromRow), null, 2);
  }

  if (name === 'get_labels') {
    const result = await db.execute('SELECT name FROM labels ORDER BY name');
    return JSON.stringify({ labels: result.rows.map(r => r.name) }, null, 2);
  }

  if (name === 'add_label') {
    await db.execute({ sql: 'INSERT OR IGNORE INTO labels (name) VALUES (?)', args: [args.label] });
    return `Label added: "${args.label}"`;
  }

  if (name === 'delete_label') {
    await db.execute({ sql: 'DELETE FROM labels WHERE name = ?', args: [args.label] });
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
      result: {
        protocolVersion: '2025-03-26',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'ctrl', version: '2.0.0' }
      }
    }), { headers });
  }

  if (method === 'tools/list') {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { tools: TOOLS } }), { headers });
  }

  if (method === 'tools/call') {
    try {
      const result = await callTool(params.name, params.arguments || {});
      return new Response(JSON.stringify({
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: result }] }
      }), { headers });
    } catch(e) {
      return new Response(JSON.stringify({
        jsonrpc: '2.0', id,
        error: { code: -32000, message: e.message }
      }), { headers });
    }
  }

  return new Response(JSON.stringify({
    jsonrpc: '2.0', id,
    error: { code: -32601, message: 'Method not found' }
  }), { status: 404, headers });
}

// Node.js runtime (required for @libsql/client)
