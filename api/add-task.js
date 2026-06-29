export default async function handler(req) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });

  let body;
  try {
    body = await req.json();
  } catch(e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers });
  }

  let { title, label, priority, duration, scheduled_on } = body;
  if (!title) return new Response(JSON.stringify({ error: 'title is required' }), { status: 400, headers });

  // Strip common Siri preamble that gets captured with the dictated text
  const preamble = [
    /^(add (a )?task( called)?:?\s*)/i,
    /^(with task manager\s*)/i,
    /^(task manager\s*)/i,
    /^(add to (my )?backlog:?\s*)/i,
    /^(remind me to\s*)/i,
    /^(add:?\s*)/i,
  ];
  for (const pattern of preamble) {
    title = title.replace(pattern, '');
  }
  title = title.trim();
  if (!title) return new Response(JSON.stringify({ error: 'title is required' }), { status: 400, headers });

  const REPO = 'vb-iant/time-manager';
  const API = `https://api.github.com/repos/${REPO}/contents/tasks.json`;
  const RAW = `https://raw.githubusercontent.com/${REPO}/main/tasks.json`;
  const TOKEN = process.env.GITHUB_TOKEN;

  try {
    // Read current tasks
    const raw = await fetch(`${RAW}?t=${Date.now()}`);
    const data = await raw.json();
    const tasks = Array.isArray(data) ? data : (data.tasks || []);

    // Get SHA
    const meta = await fetch(API, { headers: { Authorization: `token ${TOKEN}` } });
    const metaJson = await meta.json();
    const sha = metaJson.sha;

    // Create new task
    const now = new Date().toISOString();
    const newTask = {
      id: 'tm-' + Date.now(),
      title: title.trim(),
      notes: null,
      status: 'backlog',
      priority: priority || null,
      duration: duration || null,
      label: label || null,
      scheduled_on: scheduled_on || null,
      due: null,
      recurring: false,
      created: now,
      updated: now,
      status_updated: now
    };

    tasks.push(newTask);
    let content = btoa(unescape(encodeURIComponent(JSON.stringify({ version: '1.0', tasks }, null, 2))));

    // Retry up to 3 times on SHA conflict
    let result;
    let currentSha = sha;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        // Re-fetch fresh SHA and tasks on retry
        await new Promise(r => setTimeout(r, 500 * attempt));
        const retry = await fetch(API, { headers: { Authorization: `token ${TOKEN}` } });
        const retryJson = await retry.json();
        currentSha = retryJson.sha;
        const retryContent = decodeURIComponent(escape(atob(retryJson.content.replace(/\n/g, ''))));
        const retryData = JSON.parse(retryContent);
        const retryTasks = Array.isArray(retryData) ? retryData : (retryData.tasks || []);
        retryTasks.push(newTask);
        content = btoa(unescape(encodeURIComponent(JSON.stringify({ version: '1.0', tasks: retryTasks }, null, 2))));
      }
      const write = await fetch(API, {
        method: 'PUT',
        headers: { Authorization: `token ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Add task via Siri: ${title}`, content, sha: currentSha })
      });
      result = await write.json();
      if (result.content) break;
      if (!result.message?.includes('conflict') && !result.message?.includes('sha')) throw new Error(result.message || 'Write failed');
    }

    if (!result.content) throw new Error('Write failed after retries');

    return new Response(JSON.stringify({ ok: true, id: newTask.id, title: newTask.title, speech: `Got it — I've added "${newTask.title}" to your backlog.` }), { headers });
  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}

export const config = { runtime: 'edge' };
