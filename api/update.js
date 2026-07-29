const REPO = 'vb-iant/time-manager';
const PLAN_FOLDERS = ['daily', 'weekly', 'reflections'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN = process.env.GITHUB_TOKEN;

  // --- LIST FILES IN A PLANS FOLDER (daily/weekly/reflections) ---
  // Lets plans.html list files without holding its own GitHub token.
  if (req.method === 'GET') {
    const rawUrl = req.url || '';
    const qs = rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?') + 1) : '';
    const folder = new URLSearchParams(qs).get('path');
    if (!PLAN_FOLDERS.includes(folder)) {
      return res.status(403).json({ error: 'Path not permitted' });
    }
    const listRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${folder}`, {
      headers: { Authorization: `token ${TOKEN}` }
    });
    if (listRes.status === 404) return res.status(200).json([]);
    const files = await listRes.json();
    return res.status(200).json(files);
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { path, content } = req.body;
  if (!path || !content) return res.status(400).json({ error: 'Missing path or content' });

  // Plans still go to GitHub — they are markdown files not data
  if (PLAN_FOLDERS.some(f => path.startsWith(f + '/'))) {
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
