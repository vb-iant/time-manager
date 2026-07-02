import { initDb } from './db.js';

const REPO = 'vb-iant/time-manager';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main`;

export default async function handler(req) {
  const headers = { 'Content-Type': 'application/json' };

  // Simple auth check — only allow with secret
  const url = new URL(req.url);
  if (url.searchParams.get('secret') !== process.env.TURSO_TOKEN) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
  }

  try {
    const db = await initDb();

    // Read tasks.json from GitHub
    const tasksRes = await fetch(`${RAW_BASE}/tasks.json?t=${Date.now()}`);
    const tasksData = await tasksRes.json();
    const tasks = Array.isArray(tasksData) ? tasksData : (tasksData.tasks || []);

    // Read labels.json from GitHub
    const labelsRes = await fetch(`${RAW_BASE}/labels.json?t=${Date.now()}`);
    const labelsData = await labelsRes.json();
    const labels = labelsData.labels || [];

    // Migrate labels
    let labelCount = 0;
    for (const label of labels) {
      await db.execute({
        sql: 'INSERT OR IGNORE INTO labels (name) VALUES (?)',
        args: [label]
      });
      labelCount++;
    }

    // Migrate tasks
    let taskCount = 0;
    for (const t of tasks) {
      await db.execute({
        sql: `INSERT OR REPLACE INTO tasks 
          (id, title, notes, status, priority, duration, label, scheduled_on, due, 
           recurring, crm_contact_id, external_system, external_task_id, created, updated, status_updated)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          t.id,
          t.title,
          t.notes || null,
          t.status || 'backlog',
          t.priority || null,
          t.duration || null,
          t.label || null,
          t.scheduled_on || null,
          t.due || null,
          t.recurring ? 1 : 0,
          t.crm_contact_id || null,
          t.external_system || null,
          t.external_task_id || null,
          t.created || new Date().toISOString(),
          t.updated || new Date().toISOString(),
          t.status_updated || null,
        ]
      });
      taskCount++;
    }

    return new Response(JSON.stringify({
      ok: true,
      migrated: { tasks: taskCount, labels: labelCount }
    }), { headers });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}

export const config = { runtime: 'nodejs' };
