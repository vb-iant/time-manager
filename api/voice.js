import { initDb } from './db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, title } = req.body;
  const today = new Date().toISOString().slice(0, 10);

  try {
    const db = await initDb();

    if (action === 'list_today') {
      const result = await db.execute({
        sql: `SELECT * FROM tasks WHERE (status = 'today' OR status = 'doing' OR (status = 'scheduled' AND scheduled_on = ?)) AND status != 'done' ORDER BY priority DESC`,
        args: [today]
      });
      const tasks = result.rows;
      if (tasks.length === 0) return res.json({ ok: true, speech: "You have no tasks scheduled for today." });
      const list = tasks.map((t, i) => `${i + 1}. ${t.title}${t.duration ? ', ' + t.duration + ' minutes' : ''}`).join('. ');
      return res.json({ ok: true, speech: `You have ${tasks.length} task${tasks.length > 1 ? 's' : ''} today. ${list}` });
    }

    if (action === 'list_backlog') {
      const result = await db.execute("SELECT * FROM tasks WHERE status = 'backlog' ORDER BY created DESC");
      const tasks = result.rows;
      if (tasks.length === 0) return res.json({ ok: true, speech: "Your backlog is empty." });
      const list = tasks.slice(0, 5).map((t, i) => `${i + 1}. ${t.title}`).join('. ');
      const more = tasks.length > 5 ? ` And ${tasks.length - 5} more.` : '';
      return res.json({ ok: true, speech: `You have ${tasks.length} tasks in your backlog. ${list}${more}` });
    }

    if (action === 'complete_task') {
      if (!title) return res.json({ ok: false, speech: "I didn't catch the task name. Please try again." });

      const result = await db.execute("SELECT * FROM tasks WHERE status != 'done'");
      const tasks = result.rows;
      const words = title.toLowerCase().split(' ').filter(w => w.length > 2);
      let best = null, bestScore = 0;
      for (const t of tasks) {
        const score = words.filter(w => t.title.toLowerCase().includes(w)).length;
        if (score > bestScore) { bestScore = score; best = t; }
      }
      if (!best || bestScore === 0) return res.json({ ok: false, speech: `I couldn't find a task matching "${title}". Please try again.` });

      const now = new Date().toISOString();
      await db.execute({ sql: "UPDATE tasks SET status = 'done', updated = ?, status_updated = ? WHERE id = ?", args: [now, now, best.id] });

      // Handle recurring
      if (best.recurring) {
        const base = best.scheduled_on || today;
        const next = new Date(base + 'T12:00:00');
        next.setDate(next.getDate() + 7);
        const nextDate = next.toISOString().slice(0, 10);
        await db.execute({
          sql: `INSERT INTO tasks (id, title, notes, status, priority, duration, label, scheduled_on, due, recurring, crm_contact_id, external_system, external_task_id, created, updated, status_updated) VALUES (?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
          args: ['tm-' + Date.now(), best.title, best.notes, best.priority, best.duration, best.label, nextDate, best.due ? nextDate : null, best.crm_contact_id, best.external_system, best.external_task_id, now, now, now]
        });
      }

      return res.json({ ok: true, speech: `Done! I've marked "${best.title}" as complete.${best.recurring ? ' The next occurrence has been scheduled.' : ''}` });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch(e) {
    return res.status(500).json({ ok: false, speech: `Something went wrong. ${e.message}` });
  }
}
