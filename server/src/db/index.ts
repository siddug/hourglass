import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

export * from './schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface DatabaseConfig {
  dbPath: string;
  runMigrations?: boolean;
}

export interface DatabaseInstance {
  db: ReturnType<typeof drizzle>;
  sqlite: Database.Database;
  close: () => void;
}

/**
 * Initialize the SQLite database with Drizzle ORM
 */
export function initDatabase(config: DatabaseConfig): DatabaseInstance {
  const { dbPath, runMigrations = true } = config;

  // Ensure directory exists
  const dbDir = dirname(dbPath);
  if (dbDir && !existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  // Create SQLite connection
  const sqlite = new Database(dbPath);

  // Enable WAL mode for better concurrent access
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  // Create Drizzle instance
  const db = drizzle(sqlite, { schema });

  // Run migrations if enabled
  if (runMigrations) {
    const migrationsFolder = join(__dirname, 'migrations');
    if (existsSync(migrationsFolder)) {
      migrate(db, { migrationsFolder });
    }
  }

  return {
    db,
    sqlite,
    close: () => sqlite.close(),
  };
}

/**
 * Create an in-memory database (useful for testing)
 */
export function createInMemoryDatabase(): DatabaseInstance {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });

  // For in-memory, we need to create tables manually since migrations won't exist
  sqlite.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY NOT NULL,
      connector_type TEXT NOT NULL,
      work_dir TEXT NOT NULL,
      session_name TEXT,
      status TEXT NOT NULL DEFAULT 'in_progress',
      approval_mode TEXT NOT NULL DEFAULT 'manual',
      agent_mode TEXT NOT NULL DEFAULT 'default',
      agent_session_id TEXT,
      scheduled_task_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX sessions_status_idx ON sessions(status);
    CREATE INDEX sessions_scheduled_task_idx ON sessions(scheduled_task_id);

    CREATE TABLE execution_processes (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'running',
      prompt TEXT NOT NULL,
      exit_code INTEGER,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE INDEX exec_proc_session_idx ON execution_processes(session_id);
    CREATE INDEX exec_proc_status_idx ON execution_processes(status);

    CREATE TABLE process_logs (
      id TEXT PRIMARY KEY NOT NULL,
      process_id TEXT NOT NULL REFERENCES execution_processes(id) ON DELETE CASCADE,
      log_type TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX proc_logs_process_idx ON process_logs(process_id);
    CREATE INDEX proc_logs_timestamp_idx ON process_logs(timestamp);

    CREATE TABLE api_keys (
      id TEXT PRIMARY KEY NOT NULL,
      provider TEXT NOT NULL,
      api_key TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX api_keys_provider_idx ON api_keys(provider);

    CREATE TABLE scheduled_tasks (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      connector_type TEXT NOT NULL,
      work_dir TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      cron_expression TEXT,
      next_run_at INTEGER,
      timezone TEXT NOT NULL DEFAULT 'UTC',
      inherit_context INTEGER NOT NULL DEFAULT 0,
      last_session_id TEXT,
      last_agent_session_id TEXT,
      agent_mode TEXT NOT NULL DEFAULT 'default',
      approval_mode TEXT NOT NULL DEFAULT 'manual',
      env TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      execution_count INTEGER NOT NULL DEFAULT 0,
      last_run_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX scheduled_tasks_enabled_idx ON scheduled_tasks(enabled);
    CREATE INDEX scheduled_tasks_next_run_idx ON scheduled_tasks(next_run_at);
  `);

  return {
    db,
    sqlite,
    close: () => sqlite.close(),
  };
}
