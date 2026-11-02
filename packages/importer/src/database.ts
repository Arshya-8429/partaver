import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const MIGRATION_FILES = [
  { version: 1, path: 'database/migrations/0001_catalogue.sql' },
  { version: 2, path: 'database/migrations/0002_search_indexes.sql' },
  { version: 3, path: 'database/migrations/0003_snapshots_and_publication.sql' },
] as const;

export function openCatalogueDatabase(path: string): Database.Database {
  const absolutePath = resolve(path);
  if (absolutePath !== ':memory:') mkdirSync(dirname(absolutePath), { recursive: true });
  const db = new Database(absolutePath);
  try {
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    if (absolutePath !== ':memory:') db.pragma('journal_mode = WAL');
    applyMigrations(db);
    ensureFts5Trigram(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function applyMigrations(db: Database.Database): void {
  let hasMigrationTable = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get());
  const installedMigrations = new Map<number, string>();
  if (hasMigrationTable) {
    for (const migration of db.prepare('SELECT version, checksum FROM schema_migrations').all() as Array<{ version: number; checksum: string }>) {
      installedMigrations.set(migration.version, migration.checksum);
    }
  }

  for (const migration of MIGRATION_FILES) {
    const sql = readFileSync(resolve(process.cwd(), migration.path), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const installed = installedMigrations.get(migration.version);
    if (installed !== undefined) {
      if (installed !== checksum) throw new Error(`Installed catalogue migration ${migration.version} checksum differs from source; create a new numbered migration`);
      continue;
    }
    if (migration.version > 1 && !hasMigrationTable) throw new Error('Catalogue schema is missing its initial migration table');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations(version, checksum, applied_at) VALUES (?, ?, ?)')
        .run(migration.version, checksum, new Date().toISOString());
    }).immediate();
    hasMigrationTable = true;
  }
}

function ensureFts5Trigram(db: Database.Database): void {
  try {
    db.prepare("SELECT rowid FROM search_fts WHERE search_fts MATCH 'abc'").all();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`SQLite FTS5 trigram search is unavailable in the installed driver: ${message}`);
  }
}

export function defaultDatabasePath(): string {
  return resolve(process.env.CATALOGUE_DB_PATH ?? 'private-data/sqlite/catalogue.db');
}

export function defaultDataRoot(): string {
  return resolve(process.env.CATALOGUE_DATA_ROOT ?? 'private-data');
}
