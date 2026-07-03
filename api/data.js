const TURSO_URL = (process.env.TURSO_URL || '').replace('libsql://', 'https://');
const TURSO_TOKEN = process.env.TURSO_TOKEN;

async function turso(sql, args = []) {
  const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TURSO_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: [
        { type: 'execute', stmt: { sql, args: args.map(v => {
          if (v === null) return { type: 'null' };
          if (typeof v === 'boolean') return { type: 'integer', value: v ? 1 : 0 };
          if (typeof v === 'number') return { type: 'integer', value: v };
          return { type: 'text', value: String(v) };
        })}},
        { type: 'close' }
      ]
    })
  });
  const data = await res.json();
  if (data.results?.[0]?.type === 'error') {
    throw new Error(`Turso error: ${data.results[0].error.message} | SQL: ${sql}`);
  }
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const rawUrl = req.url || '';
  const qs = rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?') + 1) : '';
  const type = new URLSearchParams(qs).get('type');

  // Read raw body via stream
  let body = {};
  if (req.method === 'POST' || req.method === 'DELETE') {
    const rawBody = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
    try { body = rawBody ? JSON.parse(rawBody) : {}; } catch(e) { body = {}; }
  }

  try {
    const now = new Date().toISOString();

    // --- TASKS ---
    if (type === 'tasks') {

      if (req.method === 'GET') {
        const result = await turso('SELECT * FROM tasks ORDER BY created DESC');
        const tasks = result.rows.map(row => rowToTask(result.cols, row));
        return res.json({ version: '1.0', tasks });
      }

      if (req.method === 'POST') {
        const t = body;
        if (!t || !t.id) return res.status(400).json({ error: 'id required', received: JSON.stringify(t) });

        const existing = await turso('SELECT id, status, recurring FROM tasks WHERE id = ?', [t.id]);

        if (existing.rows.length) {
          // Update existing task
          const prev = rowToTask(existing.cols, existing.rows[0]);
          const statusChanged = t.status && t.status !== prev.status;

          if (statusChanged) {
            await turso(
              'UPDATE tasks SET title=?, notes=?, status=?, priority=?, duration=?, label=?, scheduled_on=?, due=?, recurring=?, updated=?, status_updated=? WHERE id=?',
              [t.title, t.notes||null, t.status||'backlog', t.priority||null, t.duration||null, t.label||null, t.scheduled_on||null, t.due||null, t.recurring?1:0, now, now, t.id]
            );
            // Handle recurring completion
            if (t.status === 'done' && prev.recurring) {
              const base = t.scheduled_on || now.slice(0, 10);
              const next = new Date(base + 'T12:00:00');
              next.setDate(next.getDate() + 7);
              const nextDate = next.toISOString().slice(0, 10);
              const newId = 'tm-' + Date.now();
              await turso(
                "INSERT INTO tasks (id, title, notes, status, priority, duration, label, scheduled_on, due, recurring, created, updated, status_updated) VALUES (?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, 1, ?, ?, ?)",
                [newId, t.title, t.notes||null, t.priority||null, t.duration||null, t.label||null, nextDate, t.due?nextDate:null, now, now, now]
              );
              return res.json({ ok: true, recurring_clone_id: newId, recurring_scheduled_on: nextDate });
            }
          } else {
            await turso(
              'UPDATE tasks SET title=?, notes=?, status=?, priority=?, duration=?, label=?, scheduled_on=?, due=?, recurring=?, updated=? WHERE id=?',
              [t.title, t.notes||null, t.status||'backlog', t.priority||null, t.duration||null, t.label||null, t.scheduled_on||null, t.due||null, t.recurring?1:0, now, t.id]
            );
          }
        } else {
          // Insert new task
          await turso(
            'INSERT INTO tasks (id, title, notes, status, priority, duration, label, scheduled_on, due, recurring, created, updated, status_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [t.id, t.title, t.notes||null, t.status||'backlog', t.priority||null, t.duration||null, t.label||null, t.scheduled_on||null, t.due||null, t.recurring?1:0, now, now, now]
          );
        }
        return res.json({ ok: true });
      }

      if (req.method === 'DELETE') {
        const { id } = body;
        if (!id) return res.status(400).json({ error: 'id required' });
        await turso('DELETE FROM tasks WHERE id = ?', [id]);
        return res.json({ ok: true });
      }
    }

    // --- LABELS ---
    if (type === 'labels') {
      if (req.method === 'GET') {
        const result = await turso('SELECT name FROM labels ORDER BY name');
        return res.json({ labels: result.rows.map(r => r[0].value) });
      }
      if (req.method === 'POST') {
        const { label } = body;
        if (!label) return res.status(400).json({ error: 'label required' });
        await turso('INSERT OR IGNORE INTO labels (name) VALUES (?)', [label]);
        return res.json({ ok: true });
      }
      if (req.method === 'DELETE') {
        const { label } = body;
        if (!label) return res.status(400).json({ error: 'label required' });
        await turso('DELETE FROM labels WHERE name = ?', [label]);
        return res.json({ ok: true });
      }
    }

    return res.status(400).json({ error: 'type must be tasks or labels' });

  } catch(e) {
    console.error('data.js error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
