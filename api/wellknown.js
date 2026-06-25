export default function handler(req, res) {
  const base = `https://${req.headers.host}`;
  const path = req.url.split('?')[0];
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (path.includes('oauth-protected-resource')) {
    return res.json({
      resource: `${base}/api/mcp`,
      authorization_servers: [base],
    });
  }

  if (path.includes('oauth-authorization-server')) {
    return res.json({
      issuer: base,
      authorization_endpoint: `${base}/api/oauth/authorize`,
      token_endpoint: `${base}/api/oauth/token`,
      registration_endpoint: `${base}/api/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
    });
  }

  res.status(404).json({ error: 'not found' });
}
