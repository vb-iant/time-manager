import { createMcpHandler } from 'mcp-handler';

const REPO = 'vb-iant/time-manager';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main`;
const API_BASE = `https://api.github.com/repos/${REPO}/contents`;

async function githubRead(path) {
  const res = await fetch(`${RAW_BASE}/${path}?t=${Date.now()}`);
  if (!res.ok) throw new Error(`Not found: ${path}`);
  return res.text();
}

async function githubWrite(path, content) {
  const TOKEN = process.env.GITHUB_TOKEN;
  const api = `${API_BASE}/${path}`;
  let sha;
  const check = await fetch(api, { headers: { 'Authorization': `token ${TOKEN}` } });
  if (check.ok) {
    const j = await check.json();
    sha = j.sha;
  }
  const encoded = Buffer.from(content, 'utf8').toString('base64');
  const body = { message: `MCP update: ${path}`, content: encoded };
  if (sha) body.sha = sha;
  const res = await fetch(api, {
    method: 'PUT',
    headers: { 'Authorization': `token ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!data.content) throw new Error(data.message || 'Write failed');
  return data.content.sha;
}

const handler = createMcpHandler(
  (server) => {
    server.tool('get_tasks', 'Get all current tasks from the time manager', {}, async () => {
      const text = await githubRead('tasks.json');
      return { content: [{ type: 'text', text }] };
    });

    server.tool('update_tasks', 'Write updated tasks.json back to the repo', {
      tasks_json: { type: 'string', description: 'Full tasks.json content as a JSON string' }
    }, async ({ tasks_json }) => {
      JSON.parse(tasks_json);
      const sha = await githubWrite('tasks.json', tasks_json);
      return { content: [{ type: 'text', text: `Saved. SHA: ${sha}` }] };
    });

    server.tool('get_plan', 'Read a daily plan, weekly plan or reflection file', {
      path: { type: 'string', description: 'File path e.g. daily/2026-06-25.md' }
    }, async ({ path }) => {
      const text = await githubRead(path);
      return { content: [{ type: 'text', text }] };
    });

    server.tool('save_plan', 'Write a daily plan, weekly plan or reflection markdown file', {
      path: { type: 'string', description: 'File path e.g. daily/2026-06-25.md' },
      content: { type: 'string', description: 'Markdown content to write' }
    }, async ({ path, content }) => {
      const allowed = ['daily/', 'weekly/', 'reflections/'];
      if (!allowed.some(p => path.startsWith(p))) throw new Error('Path not permitted');
      const sha = await githubWrite(path, content);
      return { content: [{ type: 'text', text: `Saved ${path}. SHA: ${sha}` }] };
    });

    server.tool('list_plans', 'List available plan files in a folder', {
      folder: { type: 'string', description: 'One of: daily, weekly, reflections' }
    }, async ({ folder }) => {
      const TOKEN = process.env.GITHUB_TOKEN;
      const res = await fetch(`${API_BASE}/${folder}`, {
        headers: { 'Authorization': `token ${TOKEN}` }
      });
      if (!res.ok) return { content: [{ type: 'text', text: 'No files found.' }] };
      const files = await res.json();
      const names = files.filter(f => f.name.endsWith('.md')).map(f => f.name).sort().reverse();
      return { content: [{ type: 'text', text: names.join('\n') }] };
    });
  },
  {
    redactedFields: [],
    dangerouslySkipAuthorization: true,
  },
  { basePath: '/api/mcp' }
);

export default handler;
