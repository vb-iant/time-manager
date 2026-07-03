export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  return res.json({
    method: req.method,
    body: req.body,
    bodyType: typeof req.body,
    contentType: req.headers['content-type'],
    hasId: req.body ? !!req.body.id : false,
  });
}
