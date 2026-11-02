import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function historyArchiveRoot(operationsPath: string): string { return resolve(dirname(operationsPath), 'price-history-sources'); }

/** Namespaced schema coexists with operational documents; it never opens catalogue.db for writing. */
export function openPriceHistoryDatabase(path: string): Database.Database {
  mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
  const db = new Database(path);
  try {
    db.pragma('foreign_keys=ON');
    db.pragma('busy_timeout=5000');
    db.pragma('journal_mode=WAL');
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ph_meta(singleton INTEGER PRIMARY KEY CHECK(singleton=1), schema_version INTEGER NOT NULL, revision INTEGER NOT NULL, settings_json TEXT) STRICT;
        INSERT OR IGNORE INTO ph_meta VALUES(1,1,0,NULL);
        CREATE TABLE IF NOT EXISTS ph_sources(sha256 TEXT PRIMARY KEY, filename TEXT NOT NULL, archive_name TEXT NOT NULL, byte_length INTEGER NOT NULL, sheets_json TEXT NOT NULL, created_at TEXT NOT NULL) STRICT;
        CREATE TABLE IF NOT EXISTS ph_batches(id TEXT PRIMARY KEY, source_sha256 TEXT NOT NULL REFERENCES ph_sources(sha256), catalogue_version TEXT NOT NULL, mapping_json TEXT NOT NULL, mapping_hash TEXT NOT NULL, staged_at TEXT NOT NULL, report_json TEXT NOT NULL, supersedes_batch_id TEXT REFERENCES ph_batches(id), UNIQUE(source_sha256,catalogue_version,mapping_hash)) STRICT;
        CREATE TABLE IF NOT EXISTS ph_batch_state(batch_id TEXT PRIMARY KEY REFERENCES ph_batches(id), status TEXT NOT NULL CHECK(status IN ('staged','active','rolled_back','superseded')), superseded_by TEXT REFERENCES ph_batches(id)) STRICT;
        CREATE TABLE IF NOT EXISTS ph_observations(id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES ph_batches(id), source_sheet TEXT NOT NULL, source_row INTEGER NOT NULL, effective_date TEXT, technical_raw TEXT NOT NULL, logistics_raw TEXT NOT NULL, part_name_raw TEXT NOT NULL, raw_price TEXT NOT NULL, normalized_price TEXT, currency_unit TEXT NOT NULL, entry_id INTEGER, match_status TEXT NOT NULL, reason TEXT, candidates_json TEXT NOT NULL, raw_json TEXT NOT NULL, UNIQUE(batch_id,source_sheet,source_row)) STRICT;
        CREATE INDEX IF NOT EXISTS ph_observations_entry ON ph_observations(entry_id,effective_date,batch_id);
        CREATE INDEX IF NOT EXISTS ph_observations_batch ON ph_observations(batch_id,source_row);
        CREATE TABLE IF NOT EXISTS ph_events(id INTEGER PRIMARY KEY, batch_id TEXT REFERENCES ph_batches(id), action TEXT NOT NULL, actor TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL, details_json TEXT NOT NULL) STRICT;
        CREATE TABLE IF NOT EXISTS ph_metrics(catalogue_version TEXT NOT NULL, entry_id INTEGER NOT NULL, metrics_json TEXT NOT NULL, classification TEXT NOT NULL, observation_count INTEGER NOT NULL, first_date TEXT, last_date TEXT, growth_bps TEXT, growth_rank INTEGER NOT NULL, PRIMARY KEY(catalogue_version,entry_id)) STRICT;
        CREATE INDEX IF NOT EXISTS ph_metrics_growth ON ph_metrics(catalogue_version,growth_rank,entry_id);
        CREATE INDEX IF NOT EXISTS ph_metrics_classification ON ph_metrics(catalogue_version,classification,observation_count);
      `);
      const meta = db.prepare('SELECT schema_version FROM ph_meta WHERE singleton=1').get() as { schema_version: number };
      if (meta.schema_version !== 1) throw new Error('Unsupported price-history schema version.');
      for (const table of ['ph_sources', 'ph_batches', 'ph_observations', 'ph_events']) {
        db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_immutable_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'Historical source evidence is immutable'); END;
          CREATE TRIGGER IF NOT EXISTS ${table}_immutable_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'Historical source evidence is immutable'); END;`);
      }
    }).immediate();
    return db;
  } catch (error) { db.close(); throw error; }
}
