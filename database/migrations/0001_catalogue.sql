CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
) STRICT;

CREATE TABLE import_runs (
  id INTEGER PRIMARY KEY,
  source_sha256 TEXT NOT NULL,
  source_archive_path TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running','succeeded','failed')),
  warnings_json TEXT NOT NULL DEFAULT '[]',
  errors_json TEXT NOT NULL DEFAULT '[]',
  report_path TEXT,
  target_version TEXT
) STRICT;

CREATE TABLE catalog_versions (
  id TEXT PRIMARY KEY,
  source_sha256 TEXT NOT NULL,
  archive_path TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  normalization_version INTEGER NOT NULL,
  rules_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  published_at TEXT,
  price_effective_at TEXT,
  currency_unit TEXT NOT NULL CHECK (currency_unit IN ('UNKNOWN','IRR','TOMAN')),
  counts_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('staging','validated','published','failed')),
  payload_hash TEXT NOT NULL
) STRICT;

CREATE TABLE catalog_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  active_version_id TEXT REFERENCES catalog_versions(id)
) STRICT;

INSERT INTO catalog_state(singleton, active_version_id) VALUES (1, NULL);

CREATE TABLE catalog_metadata (
  version_id TEXT NOT NULL REFERENCES catalog_versions(id) ON DELETE CASCADE,
  metadata_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  PRIMARY KEY(version_id, metadata_key)
) STRICT;

CREATE TABLE part_names (
  id INTEGER PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES catalog_versions(id) ON DELETE CASCADE,
  name_raw TEXT NOT NULL COLLATE BINARY,
  name_norm TEXT NOT NULL,
  name_sort_rank INTEGER NOT NULL,
  UNIQUE(version_id, name_raw),
  UNIQUE(version_id, id)
) STRICT;

CREATE TABLE parts (
  id INTEGER PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES catalog_versions(id) ON DELETE CASCADE,
  tech_raw TEXT NOT NULL COLLATE BINARY,
  tech_norm TEXT NOT NULL,
  name_id INTEGER NOT NULL,
  tech_sort_rank INTEGER NOT NULL,
  UNIQUE(version_id, tech_raw),
  UNIQUE(version_id, id),
  FOREIGN KEY(version_id, name_id) REFERENCES part_names(version_id, id)
) STRICT;

CREATE TABLE catalog_entries (
  id INTEGER PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES catalog_versions(id) ON DELETE CASCADE,
  part_id INTEGER NOT NULL,
  log_raw TEXT NOT NULL COLLATE BINARY,
  log_norm TEXT NOT NULL,
  base_price INTEGER NOT NULL CHECK(base_price >= 0),
  replacement_raw TEXT NOT NULL,
  source_row_ordinal INTEGER NOT NULL,
  source_row_sha256 TEXT NOT NULL,
  suffix01_rank INTEGER NOT NULL CHECK(suffix01_rank IN (0,1)),
  UNIQUE(version_id, log_raw),
  UNIQUE(version_id, source_row_ordinal),
  UNIQUE(version_id, id),
  FOREIGN KEY(version_id, part_id) REFERENCES parts(version_id, id)
) STRICT;

CREATE TABLE vehicle_models (
  id INTEGER PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES catalog_versions(id) ON DELETE CASCADE,
  name_raw TEXT NOT NULL COLLATE BINARY,
  name_norm TEXT NOT NULL,
  UNIQUE(version_id, name_raw),
  UNIQUE(version_id, id)
) STRICT;

CREATE TABLE entry_vehicle_models (
  version_id TEXT NOT NULL,
  entry_id INTEGER NOT NULL,
  ordinal INTEGER NOT NULL,
  model_id INTEGER NOT NULL,
  PRIMARY KEY(version_id, entry_id, ordinal),
  FOREIGN KEY(version_id, entry_id) REFERENCES catalog_entries(version_id, id) ON DELETE CASCADE,
  FOREIGN KEY(version_id, model_id) REFERENCES vehicle_models(version_id, id)
) STRICT;

CREATE TABLE entry_friendly_labels (
  version_id TEXT NOT NULL,
  entry_id INTEGER NOT NULL,
  ordinal INTEGER NOT NULL,
  label_raw TEXT NOT NULL,
  label_norm TEXT NOT NULL,
  PRIMARY KEY(version_id, entry_id, ordinal),
  FOREIGN KEY(version_id, entry_id) REFERENCES catalog_entries(version_id, id) ON DELETE CASCADE
) STRICT;

CREATE TABLE entry_aliases (
  version_id TEXT NOT NULL,
  entry_id INTEGER NOT NULL,
  ordinal INTEGER NOT NULL,
  alias_raw TEXT NOT NULL,
  alias_norm TEXT NOT NULL,
  PRIMARY KEY(version_id, entry_id, ordinal),
  FOREIGN KEY(version_id, entry_id) REFERENCES catalog_entries(version_id, id) ON DELETE CASCADE
) STRICT;

CREATE TABLE entry_replacements (
  version_id TEXT NOT NULL,
  entry_id INTEGER NOT NULL,
  ordinal INTEGER NOT NULL,
  token_raw TEXT NOT NULL,
  token_norm TEXT NOT NULL,
  target_part_id INTEGER,
  PRIMARY KEY(version_id, entry_id, ordinal),
  FOREIGN KEY(version_id, entry_id) REFERENCES catalog_entries(version_id, id) ON DELETE CASCADE,
  FOREIGN KEY(version_id, target_part_id) REFERENCES parts(version_id, id)
) STRICT;

CREATE TABLE vehicle_options (
  id INTEGER PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES catalog_versions(id) ON DELETE CASCADE,
  option_kind TEXT NOT NULL CHECK(option_kind IN ('main','other')),
  label_raw TEXT NOT NULL COLLATE BINARY,
  label_norm TEXT NOT NULL,
  keywords_raw TEXT NOT NULL,
  keywords_norm TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  source_option_ordinal INTEGER NOT NULL,
  canonicalization_provenance TEXT NOT NULL,
  UNIQUE(version_id, id),
  UNIQUE(version_id, option_kind, label_raw),
  UNIQUE(version_id, option_kind, display_order)
) STRICT;

CREATE TABLE vehicle_option_models (
  version_id TEXT NOT NULL,
  option_id INTEGER NOT NULL,
  ordinal INTEGER NOT NULL,
  model_id INTEGER NOT NULL,
  PRIMARY KEY(version_id, option_id, ordinal),
  FOREIGN KEY(version_id, option_id) REFERENCES vehicle_options(version_id, id) ON DELETE CASCADE,
  FOREIGN KEY(version_id, model_id) REFERENCES vehicle_models(version_id, id)
) STRICT;

CREATE TABLE preset_families (
  version_id TEXT NOT NULL REFERENCES catalog_versions(id) ON DELETE CASCADE,
  family_key TEXT NOT NULL,
  label_raw TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  PRIMARY KEY(version_id, family_key),
  UNIQUE(version_id, display_order)
) STRICT;

CREATE TABLE preset_family_options (
  version_id TEXT NOT NULL,
  family_key TEXT NOT NULL,
  option_id INTEGER NOT NULL,
  display_order INTEGER NOT NULL,
  PRIMARY KEY(version_id, family_key, option_id),
  FOREIGN KEY(version_id, family_key) REFERENCES preset_families(version_id, family_key) ON DELETE CASCADE,
  FOREIGN KEY(version_id, option_id) REFERENCES vehicle_options(version_id, id)
) STRICT;

CREATE TABLE code_family_members (
  version_id TEXT NOT NULL,
  part_id INTEGER NOT NULL,
  display_root TEXT NOT NULL,
  variant_label TEXT NOT NULL,
  rule_version INTEGER NOT NULL,
  provenance TEXT NOT NULL CHECK(provenance='legacy_heuristic'),
  verified INTEGER NOT NULL DEFAULT 0 CHECK(verified IN (0,1)),
  PRIMARY KEY(version_id, part_id),
  FOREIGN KEY(version_id, part_id) REFERENCES parts(version_id, id) ON DELETE CASCADE
) STRICT;

CREATE TABLE search_documents (
  id INTEGER PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES catalog_versions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('name','alias','tech','log','replacement')),
  raw_value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  UNIQUE(version_id, kind, normalized_value),
  UNIQUE(version_id, id)
) STRICT;

CREATE TABLE entry_search_documents (
  version_id TEXT NOT NULL,
  entry_id INTEGER NOT NULL,
  doc_id INTEGER NOT NULL,
  PRIMARY KEY(version_id, entry_id, doc_id),
  FOREIGN KEY(version_id, entry_id) REFERENCES catalog_entries(version_id, id) ON DELETE CASCADE,
  FOREIGN KEY(version_id, doc_id) REFERENCES search_documents(version_id, id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_part_names_norm ON part_names(version_id, name_norm, name_sort_rank);
CREATE INDEX idx_parts_tech_norm ON parts(version_id, tech_norm, tech_sort_rank);
CREATE INDEX idx_catalog_entries_log_norm ON catalog_entries(version_id, log_norm, source_row_ordinal);
CREATE INDEX idx_catalog_entries_part ON catalog_entries(version_id, part_id, suffix01_rank, base_price);
CREATE INDEX idx_entry_replacements_norm ON entry_replacements(version_id, token_norm, entry_id);
CREATE INDEX idx_entry_vehicle_model_membership ON entry_vehicle_models(version_id, model_id, entry_id);
CREATE INDEX idx_vehicle_options_label ON vehicle_options(version_id, label_norm, option_kind, display_order);
CREATE INDEX idx_search_documents_value ON search_documents(version_id, kind, normalized_value);
CREATE INDEX idx_code_family_root ON code_family_members(version_id, display_root, part_id);

CREATE VIRTUAL TABLE search_fts USING fts5(normalized_value, tokenize='trigram');
