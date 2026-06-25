export default function handler(req, res) {
  const base = `https://${req.headers.host}`;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/api/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
  });
}
