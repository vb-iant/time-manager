export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { redirect_uris, client_name } = req.body || {};

  // Accept any client registration, return a static client_id
  res.status(201).json({
    client_id: 'time-manager-client',
    client_name: client_name || 'Time Manager',
    redirect_uris: redirect_uris || [],
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  });
}
