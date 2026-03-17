import Database from "better-sqlite3";
import path from "path";

// DB path: /app/data in Docker, ./data locally
const DB_DIR = process.env.DB_PATH || path.join(process.cwd(), "data");
const DB_FILE = path.join(DB_DIR, "waitlist.db");

// Singleton
let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    // Ensure data dir exists
    const fs = require("fs");
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

    db = new Database(DB_FILE);
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");

    // Create table
    db.exec(`
      CREATE TABLE IF NOT EXISTS waitlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL DEFAULT 'unknown',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }
  return db;
}

// --- Write queue ---
type QueueTask = {
  run: () => unknown;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

const queue: QueueTask[] = [];
let processing = false;

async function processQueue() {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    const task = queue.shift()!;
    try {
      const result = task.run();
      task.resolve(result);
    } catch (err) {
      task.reject(err);
    }
  }

  processing = false;
}

function enqueue<T>(run: () => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({ run, resolve: resolve as (v: unknown) => void, reject });
    processQueue();
  });
}

// --- Public API ---
export function addToWaitlist(firstName: string, lastName: string, email: string, source: string = "unknown") {
  return enqueue(() => {
    const db = getDb();
    const stmt = db.prepare(
      "INSERT INTO waitlist (first_name, last_name, email, source) VALUES (?, ?, ?, ?)"
    );
    return stmt.run(firstName, lastName, email, source);
  });
}

export function getWaitlistCount() {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM waitlist").get() as { count: number };
  return row.count;
}

export function getWaitlistEntries() {
  const db = getDb();
  return db.prepare("SELECT * FROM waitlist ORDER BY created_at DESC").all();
}
