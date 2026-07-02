import { createClient } from '@libsql/client/web';

let _client = null;

export function getDb() {
  if (!_client) {
    _client = createClient({
      url: process.env.TURSO_URL,
      authToken: process.env.TURSO_TOKEN,
    });
  }
  return _client;
}

export async function initDb() {
  const db = getDb();
  
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'backlog',
      priority TEXT,
      duration INTEGER,
      label TEXT,
      scheduled_on TEXT,
      due TEXT,
      recurring INTEGER NOT NULL DEFAULT 0,
      crm_contact_id TEXT,
      external_system TEXT,
      external_task_id TEXT,
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      status_updated TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS labels (
      name TEXT PRIMARY KEY
    )
  `);

  return db;
}

export function taskFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes || null,
    status: row.status || 'backlog',
    priority: row.priority || null,
    duration: row.duration || null,
    label: row.label || null,
    scheduled_on: row.scheduled_on || null,
    due: row.due || null,
    recurring: row.recurring === 1 || row.recurring === true,
    crm_contact_id: row.crm_contact_id || null,
    external_system: row.external_system || null,
    external_task_id: row.external_task_id || null,
    created: row.created,
    updated: row.updated,
    status_updated: row.status_updated || null,
  };
}
