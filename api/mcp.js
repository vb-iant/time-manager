const REPO = 'vb-iant/time-manager';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main`;
const API_BASE = `https://api.github.com/repos/${REPO}/contents`;

const TOOLS = [
  {
    name: 'get_tasks',
    description: 'Get all current tasks from the time manager',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'update_tasks',
    description: 'Write updated tasks.json back to the repo',
    inputSchema: {
      type: 'object',
      properties: {
        tasks_json: { type: 'string', description: 'Full tasks.json content as a JSON string' }
      },
      required: ['tasks_json']
    }
  },
  {
    name: 'get_plan',
    description: 'Read a daily plan, weekly plan or reflection file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path e.g. daily/2026-06-25.md' }
      },
      required: ['path']
    }
  },
  {
    name: 'save_plan',
    description: 'Write a daily plan, weekly plan or reflection markdown file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path e.g. daily/2026-06-25.md' },
        content: { type: 'string', description: 'Markdown content to write' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'add_task',
    description: 'Add a single new task to the backlog without needing to read/write all tasks',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        notes: { type: 'string', description: 'Optional notes or description' },
        duration: { type: 'number', description: 'Estimated duration in minutes' },
        label: { type: 'string', description: 'Label e.g. Business Development, Admin, Podcast, Client Work, Dev Project' },
        scheduled_on: { type: 'string', description: 'Date to schedule task YYYY-MM-DD (optional)' },
        due: { type: 'string', description: 'Due date YYYY-MM-DD (optional)' },
        status: { type: 'string', description: 'Status: backlog, scheduled, today, doing, blocked, done. Defaults to backlog.' }
      },
      required: ['title']
    }
  },
  {
    name: 'delete_task',
    description: 'Delete a single task by its id',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The task id to delete' }
      },
      required: ['id']
    }
  },
  {
    name: 'list_plans',
    description: 'List available plan files in a folder',
    inputSchema: {
      type: 'object',
      properties: {
        folder: { type: 'string', description: 'One of: daily, weekly, reflections' }
      },
      required: ['folder']
    }
  }
];

async function githubRead(path) {
  const res = await fetch(`${RAW_BASE}/${path}?t=${Date.now()}`);
  if (!res.ok) throw new Error(`Not found: ${path}`);
  return res.text();
}

async function githubWrite(path, content) {
  const GH_TOKEN = process.env.GITHUB_TOKEN;
  const api = `${API_BASE}/${path}`;
  let sha;
  const check = await fetch(api, { headers: { Authorization: `token ${GH_TOKEN}` } });
  if (check.ok) sha = (await check.json()).sha;
  const encoded = btoa(unescape(encodeURIComponent(content)));
  const body = { message: `MCP update: ${path}`, content: encoded };
  if (sha) body.sha = sha;
  const res = await fetch(api, {
    method: 'PUT',
    headers: { Authorization: `token ${GH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!data.content) throw new Error(data.message || 'Write failed');
  return data.content.sha;
}

async function callTool(name, args) {
  if (name === 'get_tasks') {
    return await githubRead('tasks.json');
  }
  if (name === 'update_tasks') {
    JSON.parse(args.tasks_json);
    const sha = await githubWrite('tasks.json', args.tasks_json);
    return `Saved. SHA: ${sha}`;
  }
  if (name === 'get_plan') {
    return await githubRead(args.path);
  }
  if (name === 'save_plan') {
    const allowed = ['daily/', 'weekly/', 'reflections/'];
    if (!allowed.some(p => args.path.startsWith(p))) throw new Error('Path not permitted');
    const sha = await githubWrite(args.path, args.content);
    return `Saved ${args.path}. SHA: ${sha}`;
  }
  if (name === 'add_task') {
    const raw = await githubRead('tasks.json');
    const parsed = JSON.parse(raw);
    const tasks = Array.isArray(parsed) ? parsed : (parsed.tasks || []);
    const now = new Date().toISOString();
    const newTask = {
      id: 'tm-' + Date.now(),
      title: args.title,
      notes: args.notes || null,
      status: args.status || 'backlog',
      duration: args.duration || null,
      label: args.label || null,
      scheduled_on: args.scheduled_on || null,
      due: args.due || null,
      created: now,
      updated: now
    };
    tasks.push(newTask);
    const output = JSON.stringify({ version: '1.0', tasks }, null, 2);
    await githubWrite('tasks.json', output);
    return `Task added: "${newTask.title}" (id: ${newTask.id})`;
  }
  if (name === 'delete_task') {
    const raw = await githubRead('tasks.json');
    const parsed = JSON.parse(raw);
    const tasks = Array.isArray(parsed) ? parsed : (parsed.tasks || []);
    const before = tasks.length;
    const filtered = tasks.filter(t => t.id !== args.id);
    if (filtered.length === before) throw new Error(`Task not found: ${args.id}`);
    const output = JSON.stringify({ version: '1.0', tasks: filtered }, null, 2);
    await githubWrite('tasks.json', output);
    return `Task deleted (id: ${args.id})`;
  }
  if (name === 'list_plans') {
    const GH_TOKEN = process.env.GITHUB_TOKEN;
    const res = await fetch(`${API_BASE}/${args.folder}`, {
      headers: { Authorization: `token ${GH_TOKEN}` }
    });
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

  if (req.method === 'GET') {
    return new Response(JSON.stringify({ status: 'ok', transport: 'streamable-http' }), { headers });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  let body;
  try {
    body = await req.json();
  } catch(e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers });
  }

  const { method, params, id } = body;

  if (method === 'notifications/initialized') {
    return new Response(null, { status: 202, headers });
  }

  if (method === 'initialize') {
    return new Response(JSON.stringify({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2025-03-26',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'time-manager', version: '1.0.0' }
      }
    }), { headers });
  }

  if (method === 'tools/list') {
    return new Response(JSON.stringify({
      jsonrpc: '2.0', id,
      result: { tools: TOOLS }
    }), { headers });
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

export const config = { runtime: 'edge' };
