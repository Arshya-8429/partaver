CREATE INDEX idx_entry_search_documents_doc
  ON entry_search_documents(version_id, doc_id, entry_id);

CREATE INDEX idx_entry_friendly_labels_lookup
  ON entry_friendly_labels(version_id, entry_id, ordinal);

CREATE INDEX idx_entry_aliases_lookup
  ON entry_aliases(version_id, entry_id, ordinal);

CREATE INDEX idx_entry_replacements_lookup
  ON entry_replacements(version_id, entry_id, ordinal);

CREATE INDEX idx_catalog_entries_paging
  ON catalog_entries(version_id, suffix01_rank, source_row_ordinal, id);
