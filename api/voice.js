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
  try { body = await req.json(); } catch(e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers });
  }

  const { action, title } = body;
  const REPO = 'vb-iant/time-manager';
  const RAW = `https://raw.githubusercontent.com/${REPO}/main/tasks.json`;
  const API = `https://api.github.com/repos/${REPO}/contents/tasks.json`;
  const TOKEN = process.env.GITHUB_TOKEN;
  const today = new Date().toISOString().slice(0, 10);

  try {
    // Always read fresh from API for writes, CDN for reads
    if (action === 'list_today') {
      const res = await fetch(`${RAW}?t=${Date.now()}`);
      const data = await res.json();
      const tasks = Array.isArray(data) ? data : (data.tasks || []);
      const todayTasks = tasks.filter(t =>
        (t.status === 'today' || t.status === 'doing' || (t.status === 'scheduled' && t.scheduled_on === today))
        && t.status !== 'done'
      );
      if (todayTasks.length === 0) {
        return new Response(JSON.stringify({ ok: true, speech: "You have no tasks scheduled for today." }), { headers });
      }
      const list = todayTasks.map((t, i) => `${i + 1}. ${t.title}${t.duration ? ', ' + t.duration + ' minutes' : ''}`).join('. ');
      return new Response(JSON.stringify({
        ok: true,
        speech: `You have ${todayTasks.length} task${todayTasks.length > 1 ? 's' : ''} today. ${list}`
      }), { headers });
    }

    if (action === 'list_backlog') {
      const res = await fetch(`${RAW}?t=${Date.now()}`);
      const data = await res.json();
      const tasks = Array.isArray(data) ? data : (data.tasks || []);
      const backlog = tasks.filter(t => t.status === 'backlog');
      if (backlog.length === 0) {
        return new Response(JSON.stringify({ ok: true, speech: "Your backlog is empty." }), { headers });
      }
      const list = backlog.slice(0, 5).map((t, i) => `${i + 1}. ${t.title}`).join('. ');
      const more = backlog.length > 5 ? ` And ${backlog.length - 5} more.` : '';
      return new Response(JSON.stringify({
        ok: true,
        speech: `You have ${backlog.length} tasks in your backlog. ${list}${more}`
      }), { headers });
    }

    if (action === 'complete_task') {
      if (!title) return new Response(JSON.stringify({ ok: false, speech: "I didn't catch the task name. Please try again." }), { headers });

      // Read via API for fresh SHA
      const metaRes = await fetch(API, { headers: { Authorization: `token ${TOKEN}` } });
      const metaJson = await metaRes.json();
      const fileSha = metaJson.sha;
      const content = decodeURIComponent(escape(atob(metaJson.content.replace(/\n/g, ''))));
      const data = JSON.parse(content);
      const tasks = Array.isArray(data) ? data : (data.tasks || []);

      // Fuzzy match — find task whose title contains the spoken words
      const search = title.toLowerCase();
      const words = search.split(' ').filter(w => w.length > 2);
      let best = null;
      let bestScore = 0;

      tasks.filter(t => t.status !== 'done').forEach(t => {
        const taskTitle = t.title.toLowerCase();
        const score = words.filter(w => taskTitle.includes(w)).length;
        if (score > bestScore) { bestScore = score; best = t; }
      });

      if (!best || bestScore === 0) {
        return new Response(JSON.stringify({ ok: false, speech: `I couldn't find a task matching "${title}". Please try again.` }), { headers });
      }

      // Mark as done
      const now = new Date().toISOString();
      const idx = tasks.findIndex(t => t.id === best.id);
      tasks[idx].status = 'done';
      tasks[idx].updated = now;
      tasks[idx].status_updated = now;

      // Handle recurring
      if (tasks[idx].recurring) {
        const base = tasks[idx].scheduled_on || today;
        const next = new Date(base + 'T12:00:00');
        next.setDate(next.getDate() + 7);
        const nextDate = next.toISOString().slice(0, 10);
        tasks.push({ ...tasks[idx], id: 'tm-' + Date.now(), status: 'scheduled', scheduled_on: nextDate, due: tasks[idx].due ? nextDate : null, created: now, updated: now, status_updated: now });
      }

      const output = btoa(unescape(encodeURIComponent(JSON.stringify({ version: '1.0', tasks }, null, 2))));
      const writeRes = await fetch(API, {
        method: 'PUT',
        headers: { Authorization: `token ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Complete task via Siri: ${best.title}`, content: output, sha: fileSha })
      });
      const writeData = await writeRes.json();
      if (!writeData.content) throw new Error(writeData.message || 'Write failed');

      return new Response(JSON.stringify({
        ok: true,
        speech: `Done! I've marked "${best.title}" as complete.${tasks[idx].recurring ? ' The next occurrence has been scheduled.' : ''}`
      }), { headers });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers });

  } catch(e) {
    return new Response(JSON.stringify({ ok: false, speech: `Something went wrong. ${e.message}` }), { status: 500, headers });
  }
}

export const config = { runtime: 'edge' };
