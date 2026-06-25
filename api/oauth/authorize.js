import crypto from 'crypto';

export default function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { redirect_uri, state, code_challenge, code_challenge_method } = req.query;

  if (req.method === 'POST') {
    // User clicked Authorize — generate a code
    const secret = process.env.OAUTH_SECRET || 'fallback-secret';
    const payload = JSON.stringify({ redirect_uri, state, code_challenge, code_challenge_method, ts: Date.now() });
    const code = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);

    // Store code data in signed token embedded in the code itself
    const codeData = Buffer.from(JSON.stringify({ redirect_uri, code_challenge, code_challenge_method })).toString('base64url');
    const fullCode = `${code}.${codeData}`;

    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set('code', fullCode);
    if (state) redirectUrl.searchParams.set('state', state);

    return res.redirect(302, redirectUrl.toString());
  }

  // GET — show consent page
  const params = new URLSearchParams(req.query).toString();
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Time Manager — Authorize</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a2e; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: white; border-radius: 12px; padding: 40px; width: 380px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
    h1 { font-size: 22px; margin-bottom: 8px; color: #1a1a2e; }
    p { color: #666; font-size: 14px; margin-bottom: 24px; line-height: 1.5; }
    .tools { background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: left; }
    .tools h3 { font-size: 12px; text-transform: uppercase; color: #888; margin-bottom: 10px; letter-spacing: 0.5px; }
    .tool { font-size: 13px; color: #444; padding: 4px 0; }
    .tool span { color: #4f46e5; font-weight: 600; }
    button { width: 100%; padding: 12px; background: #4f46e5; color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; }
    button:hover { background: #4338ca; }
  </style>
</head>
<body>
  <div class="card">
    <h1>⏱ Time Manager</h1>
    <p>Claude is requesting access to your Time Manager. This allows Claude to read and update your tasks and plans.</p>
    <div class="tools">
      <h3>Access requested</h3>
      <div class="tool">📋 <span>get_tasks</span> — read your tasks</div>
      <div class="tool">✏️ <span>update_tasks</span> — update tasks</div>
      <div class="tool">📝 <span>save_plan</span> — write plans</div>
      <div class="tool">📖 <span>get_plan</span> — read plans</div>
      <div class="tool">📂 <span>list_plans</span> — list files</div>
    </div>
    <form method="POST" action="/api/oauth/authorize?${params}">
      <button type="submit">Authorize Claude</button>
    </form>
  </div>
</body>
</html>`);
}
