import crypto from 'crypto';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { code, redirect_uri, code_verifier } = req.body || {};

  if (!code) return res.status(400).json({ error: 'invalid_grant', error_description: 'Missing code' });

  // Decode the code — we trust it if it parses (single user, no real auth needed)
  try {
    const [, codeData] = code.split('.');
    JSON.parse(Buffer.from(codeData, 'base64url').toString());
  } catch(e) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid code' });
  }

  // Issue a simple access token — signed with our secret
  const secret = process.env.OAUTH_SECRET || 'fallback-secret';
  const payload = `time-manager-access-${Date.now()}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 16);
  const accessToken = `${payload}-${sig}`;

  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 7776000, // 90 days
    scope: 'read write',
  });
}
