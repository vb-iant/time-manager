import { initDb } from './db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const db = await initDb();

    if (req.method === 'GET') {
      const result = await db.execute('SELECT name FROM labels ORDER BY name');
      return res.status(200).json({ labels: result.rows.map(r => r.name) });
    }

    if (req.method === 'POST') {
      const { label } = req.body;
      if (!label) return res.status(400).json({ error: 'label required' });
      await db.execute({ sql: 'INSERT OR IGNORE INTO labels (name) VALUES (?)', args: [label] });
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { label } = req.body;
      if (!label) return res.status(400).json({ error: 'label required' });
      await db.execute({ sql: 'DELETE FROM labels WHERE name = ?', args: [label] });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
