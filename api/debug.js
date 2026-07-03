export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const TURSO_URL = (process.env.TURSO_URL || '').replace('libsql://', 'https://');
  const TURSO_TOKEN = process.env.TURSO_TOKEN;
  
  const testId = 'debug-' + Date.now();
  const requestBody = {
    requests: [
      { type: 'execute', stmt: { 
        sql: 'INSERT OR IGNORE INTO tasks (id, title, status, recurring, created, updated, status_updated) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [
          {type:'text',value:testId},
          {type:'text',value:'Debug test task'},
          {type:'text',value:'backlog'},
          {type:'integer',value:0},
          {type:'text',value:new Date().toISOString()},
          {type:'text',value:new Date().toISOString()},
          {type:'text',value:new Date().toISOString()}
        ]
      }},
      { type: 'close' }
    ]
  };
  
  const writeRes = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TURSO_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });
  
  const writeText = await writeRes.text();
  let writeData;
  try { writeData = JSON.parse(writeText); } catch(e) { writeData = writeText; }
  
  return res.json({
    tursoUrl: TURSO_URL,
    hasToken: !!TURSO_TOKEN,
    writeStatus: writeRes.status,
    writeRaw: writeText.slice(0, 500),
    writeData,
    requestSent: requestBody
  });
}
