export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const TURSO_URL = (process.env.TURSO_URL || '').replace('libsql://', 'https://');
  const TURSO_TOKEN = process.env.TURSO_TOKEN;
  
  // Try a test insert
  const testId = 'debug-' + Date.now();
  const body = JSON.stringify({
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
  });
  
  const writeRes = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TURSO_TOKEN}`, 'Content-Type': 'application/json' },
    body
  });
  const writeData = await writeRes.json();
  
  // Now read it back
  const readRes = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST', 
    headers: { 'Authorization': `Bearer ${TURSO_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        { type: 'execute', stmt: { sql: 'SELECT id, title FROM tasks WHERE id = ?', args: [{type:'text',value:testId}] }},
        { type: 'close' }
      ]
    })
  });
  const readData = await readRes.json();
  
  return res.json({
    tursoUrl: TURSO_URL,
    hasToken: !!TURSO_TOKEN,
    tokenLength: TURSO_TOKEN?.length,
    writeStatus: writeRes.status,
    writeResult: writeData.results?.[0],
    readResult: readData.results?.[0]?.response?.result?.rows,
    testId
  });
}
