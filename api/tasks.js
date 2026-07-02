import { initDb, taskFromRow } from './db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const db = await initDb();
    const result = await db.execute('SELECT * FROM tasks ORDER BY created DESC');
    const tasks = result.rows.map(taskFromRow);
    return res.status(200).json({ version: '1.0', tasks });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
