import { initDb, taskFromRow } from './db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const db = await initDb();
    const now = new Date().toISOString();

    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      await db.execute({ sql: 'DELETE FROM tasks WHERE id = ?', args: [id] });
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'POST') {
      const t = req.body;
      if (!t.id) return res.status(400).json({ error: 'id required' });

      // Check if exists
      const existing = await db.execute({ sql: 'SELECT id, status FROM tasks WHERE id = ?', args: [t.id] });

      if (existing.rows.length) {
        // Update
        const prevStatus = existing.rows[0].status;
        const statusChanged = t.status && t.status !== prevStatus;

        await db.execute({
          sql: `UPDATE tasks SET title=?, notes=?, status=?, priority=?, duration=?, label=?,
                scheduled_on=?, due=?, recurring=?, updated=?
                ${statusChanged ? ', status_updated=?' : ''}
                WHERE id=?`,
          args: statusChanged
            ? [t.title, t.notes||null, t.status||'backlog', t.priority||null, t.duration||null, t.label||null, t.scheduled_on||null, t.due||null, t.recurring?1:0, now, now, t.id]
            : [t.title, t.notes||null, t.status||'backlog', t.priority||null, t.duration||null, t.label||null, t.scheduled_on||null, t.due||null, t.recurring?1:0, now, t.id]
        });

        // Handle recurring completion
        if (statusChanged && t.status === 'done' && t.recurring) {
          const base = t.scheduled_on || now.slice(0, 10);
          const next = new Date(base + 'T12:00:00');
          next.setDate(next.getDate() + 7);
          const nextDate = next.toISOString().slice(0, 10);
          const newId = crypto.randomUUID();
          await db.execute({
            sql: `INSERT INTO tasks (id, title, notes, status, priority, duration, label, scheduled_on, due, recurring, created, updated, status_updated) VALUES (?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
            args: [newId, t.title, t.notes||null, t.priority||null, t.duration||null, t.label||null, nextDate, t.due?nextDate:null, now, now, now]
          });
          return res.status(200).json({ ok: true, recurring_clone_id: newId, recurring_scheduled_on: nextDate });
        }
      } else {
        // Insert
        await db.execute({
          sql: `INSERT INTO tasks (id, title, notes, status, priority, duration, label, scheduled_on, due, recurring, created, updated, status_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [t.id, t.title, t.notes||null, t.status||'backlog', t.priority||null, t.duration||null, t.label||null, t.scheduled_on||null, t.due||null, t.recurring?1:0, now, now, now]
        });
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
