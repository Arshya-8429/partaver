# PartAvar app audit

2026-10-27, before PartAvar feature integration. Existing catalogue/migration and compact two-theme search UI are working and verified in prior reports. Actual local UI UX Designer 1.1.0 core/audit/redesign/mobile/component/design-system/accessibility methods are used; no independent design MCP service exists.

Gaps to implement: no invoice/purchase/package documents or history; no historical observations/importer; native datalist still used for name hints; result actions only copy/details; no PartAvar brand/navigation/public site. All 119 raw models are represented by the 116 explicit projected options (read-only SQL found zero uncovered models); preserve that mapping.

Legacy v3 behavior inspection reveals technical-code-only line/suggestion dedup and global suggestion fallback. Preserve workflows while correcting these identity/fitment hazards to match the new binding specification. Legacy export named XLS is HTML, not a real XLSX workbook; new export must use actual XLSX and read-back evidence.
