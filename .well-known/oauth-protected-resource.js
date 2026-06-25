export default function handler(req, res) {
  const base = `https://${req.headers.host}`;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    resource: `${base}/api/mcp`,
    authorization_servers: [`${base}`],
  });
}
