import { initDb } from './db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { path, content } = req.body;
  if (!path || !content) return res.status(400).json({ error: 'Missing path or content' });

  // Plans still go to GitHub — they are markdown files not data
  const planPaths = ['daily/', 'weekly/', 'reflections/'];
  if (planPaths.some(p => path.startsWith(p))) {
    const REPO = 'vb-iant/time-manager';
    const TOKEN = process.env.GITHUB_TOKEN;
    const API = `https://api.github.com/repos/${REPO}/contents/${path}`;

    let sha;
    const check = await fetch(API, { headers: { Authorization: `token ${TOKEN}` } });
    if (check.ok) sha = (await check.json()).sha;

    const encoded = Buffer.from(content, 'utf8').toString('base64');
    const body = { message: `Update ${path}`, content: encoded };
    if (sha) body.sha = sha;

    const write = await fetch(API, {
      method: 'PUT',
      headers: { Authorization: `token ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await write.json();
    if (data.content) return res.status(200).json({ ok: true });
    return res.status(500).json({ error: data.message || 'GitHub write failed' });
  }

  return res.status(403).json({ error: 'Path not permitted — tasks now managed via Turso' });
}
