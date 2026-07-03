const TURSO_URL = (process.env.TURSO_URL || '').replace('libsql://', 'https://');
const TURSO_TOKEN = process.env.TURSO_TOKEN;

async function turso(sql, args = []) {
  const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TURSO_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [
      { type: 'execute', stmt: { sql, args: args.map(v => {
        if (v === null) return { type: 'null' };
        if (typeof v === 'number') return { type: 'integer', value: v };
        return { type: 'text', value: String(v) };
      })}},
      { type: 'close' }
    ]})
  });
  const data = await res.json();
  if (data.results?.[0]?.type === 'error') throw new Error(data.results[0].error.message);
  return data.results?.[0]?.response?.result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Read raw body via stream
  const rawBody = await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
  const reqBody = rawBody ? JSON.parse(rawBody) : {};
  const { action, title } = reqBody;
  const today = new Date().toISOString().slice(0, 10);

  try {
    if (action === 'list_today') {
      const result = await turso(
        "SELECT title, duration FROM tasks WHERE (status = 'today' OR status = 'doing' OR (status = 'scheduled' AND scheduled_on = ?)) AND status != 'done'",
        [today]
      );
      const tasks = result.rows;
      if (!tasks.length) return res.json({ ok: true, speech: 'You have no tasks scheduled for today.' });
      const list = tasks.map((r, i) => {
        const t = r[0].value;
        const d = r[1].type !== 'null' ? r[1].value : null;
        return `${i+1}. ${t}${d ? ', ' + d + ' minutes' : ''}`;
      }).join('. ');
      return res.json({ ok: true, speech: `You have ${tasks.length} task${tasks.length > 1 ? 's' : ''} today. ${list}` });
    }

    if (action === 'list_backlog') {
      const result = await turso("SELECT title FROM tasks WHERE status = 'backlog' ORDER BY created DESC LIMIT 10");
      const tasks = result.rows;
      if (!tasks.length) return res.json({ ok: true, speech: 'Your backlog is empty.' });
      const list = tasks.slice(0, 5).map((r, i) => `${i+1}. ${r[0].value}`).join('. ');
      const more = tasks.length > 5 ? ` And ${tasks.length - 5} more.` : '';
      return res.json({ ok: true, speech: `You have ${tasks.length} tasks in your backlog. ${list}${more}` });
    }

    if (action === 'complete_task') {
      if (!title) return res.json({ ok: false, speech: "I didn't catch the task name. Please try again." });
      const result = await turso("SELECT id, title, recurring, scheduled_on, due FROM tasks WHERE status != 'done'");
      const words = title.toLowerCase().split(' ').filter(w => w.length > 2);
      let best = null, bestScore = 0;
      for (const row of result.rows) {
        const t = row[1].value;
        const score = words.filter(w => t.toLowerCase().includes(w)).length;
        if (score > bestScore) { bestScore = score; best = row; }
      }
      if (!best || bestScore === 0) return res.json({ ok: false, speech: `I couldn't find a task matching "${title}". Please try again.` });
      const taskId = best[0].value;
      const taskTitle = best[1].value;
      const isRecurring = best[2].value === '1';
      const scheduledOn = best[3].type !== 'null' ? best[3].value : null;
      const now = new Date().toISOString();
      await turso("UPDATE tasks SET status = 'done', updated = ?, status_updated = ? WHERE id = ?", [now, now, taskId]);
      if (isRecurring) {
        const base = scheduledOn || today;
        const next = new Date(base + 'T12:00:00');
        next.setDate(next.getDate() + 7);
        const nextDate = next.toISOString().slice(0, 10);
        await turso(
          "INSERT INTO tasks (id, title, status, scheduled_on, recurring, created, updated, status_updated) VALUES (?, ?, 'scheduled', ?, 1, ?, ?, ?)",
          ['tm-' + Date.now(), taskTitle, nextDate, now, now, now]
        );
      }
      return res.json({ ok: true, speech: `Done! I've marked "${taskTitle}" as complete.${isRecurring ? ' The next occurrence has been scheduled.' : ''}` });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch(e) {
    return res.status(500).json({ ok: false, speech: `Something went wrong. ${e.message}` });
  }
}
