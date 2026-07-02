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

  let { title, label, priority, duration, scheduled_on, status, notes, recurring,
        crm_contact_id, external_system, external_task_id } = req.body;

  if (!title) return res.status(400).json({ error: 'title is required' });

  const preamble = [
    /^(add (a )?task( called)?:\s*)/i,
    /^(with (ctrl|task manager)\s*)/i,
    /^((ctrl|task manager)\s*)/i,
    /^(add to (my )?backlog:\s*)/i,
    /^(remind me to\s*)/i,
    /^(add:\s*)/i,
  ];
  for (const pattern of preamble) title = title.replace(pattern, '');
  title = title.trim();
  if (!title) return res.status(400).json({ error: 'title is required after cleaning' });

  try {
    const now = new Date().toISOString();
    const id = 'tm-' + Date.now();
    await turso(
      'INSERT INTO tasks (id, title, notes, status, priority, duration, label, scheduled_on, due, recurring, crm_contact_id, external_system, external_task_id, created, updated, status_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, title, notes||null, status||'backlog', priority||null, duration||null, label||null, scheduled_on||null, null, recurring?1:0, crm_contact_id||null, external_system||null, external_task_id||null, now, now, now]
    );
    return res.status(200).json({ ok: true, id, title, speech: `Got it — I've added "${title}" to your backlog.` });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
