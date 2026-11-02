CREATE TABLE catalog_snapshots (
  version_id TEXT PRIMARY KEY REFERENCES catalog_versions(id) ON DELETE CASCADE,
  manifest_json TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  total_decoded_bytes INTEGER NOT NULL CHECK(total_decoded_bytes >= 0),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE catalog_snapshot_chunks (
  version_id TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  table_name TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  record_count INTEGER NOT NULL CHECK(record_count > 0),
  decoded_bytes INTEGER NOT NULL CHECK(decoded_bytes > 0),
  sha256 TEXT NOT NULL,
  PRIMARY KEY(version_id, chunk_id),
  UNIQUE(version_id, table_name, ordinal),
  FOREIGN KEY(version_id) REFERENCES catalog_snapshots(version_id) ON DELETE CASCADE
) STRICT;

CREATE TABLE catalog_publication_events (
  id INTEGER PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES catalog_versions(id),
  prior_version_id TEXT REFERENCES catalog_versions(id),
  action TEXT NOT NULL CHECK(action IN ('publish','rollback')),
  occurred_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_publication_events_version ON catalog_publication_events(version_id, occurred_at);
