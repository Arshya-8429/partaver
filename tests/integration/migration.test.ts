import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { importCatalogue } from '../../packages/importer/src/import.js';

const sourcePath = resolve('PartsFinder_Android-28 (1) (1).html');
const temporaryDirectories: string[] = [];

async function temporaryProject(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'partsfinder-migration-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('catalogue migration', () => {
  it('imports the actual source without merging sibling logistics prices or vehicle data', async () => {
    const root = await temporaryProject();
    const dbPath = join(root, 'catalogue.db');
    const report = await importCatalogue(sourcePath, { dbPath, dataRoot: root });
    const db = new Database(dbPath, { readonly: true });
    try {
      expect(report.status).toBe('validated');
      expect(report.currencyUnit).toBe('UNKNOWN');
      expect(report.priceEffectiveAt).toBeNull();
      expect(report.counts).toMatchObject({ rows: 36_569, technicalCodes: 31_509, logisticsCodes: 36_569 });
      const siblings = db.prepare(`
        SELECT e.log_raw, CAST(e.base_price AS TEXT) AS base_price
        FROM catalog_entries e JOIN parts p ON p.version_id=e.version_id AND p.id=e.part_id
        WHERE e.version_id=? AND p.tech_raw=? ORDER BY e.source_row_ordinal
      `).all(report.versionId, '0CF25BE-1500011BA');
      expect(siblings).toHaveLength(5);
      expect(siblings).toContainEqual({ log_raw: '0CF25BE-1500011BA-01', base_price: '3649644321' });

      const modelLess = db.prepare(`
        SELECT e.log_raw, COUNT(vm.model_id) AS model_count
        FROM catalog_entries e
        JOIN parts p ON p.version_id=e.version_id AND p.id=e.part_id
        LEFT JOIN entry_vehicle_models vm ON vm.version_id=e.version_id AND vm.entry_id=e.id
        WHERE e.version_id=? AND p.tech_raw=? AND e.log_raw=?
        GROUP BY e.id
      `).get(report.versionId, '112000177AA', '112000177AA-03');
      expect(modelLess).toEqual({ log_raw: '112000177AA-03', model_count: 0 });

      const active = db.prepare('SELECT active_version_id FROM catalog_state WHERE singleton=1').get();
      expect(active).toEqual({ active_version_id: null });
    } finally {
      db.close();
    }
  });

  it('is idempotent for the same source hash and archives source bytes exactly', async () => {
    const root = await temporaryProject();
    const dbPath = join(root, 'catalogue.db');
    const first = await importCatalogue(sourcePath, { dbPath, dataRoot: root });
    const second = await importCatalogue(sourcePath, { dbPath, dataRoot: root });
    expect(second.versionId).toBe(first.versionId);
    expect(second.alreadyImported).toBe(true);
    const source = await readFile(sourcePath);
    const archived = await readFile(join(root, 'source-archive', `${first.sourceSha256}.html`));
    expect(archived).toEqual(source);
    const db = new Database(dbPath, { readonly: true });
    try {
      expect(db.prepare('SELECT COUNT(*) AS count FROM catalog_versions').get()).toEqual({ count: 1 });
      expect(db.prepare('SELECT COUNT(*) AS count FROM catalog_entries').get()).toEqual({ count: 36_569 });
    } finally {
      db.close();
    }
  });

  it('keeps the active version unchanged when a staged insert fails', async () => {
    const root = await temporaryProject();
    const dbPath = join(root, 'catalogue.db');
    const minimalDb = (part: string) => ({
      rows: [
        { part, models: ['A'], tech: 'TECH-01', log: 'LOG-01', price: 1, replacement: 'MISSING-01', friendly: ['A'], aliases: ['alias'] },
        { part, models: [], tech: 'TECH-01', log: 'LOG-02', price: 2, replacement: '', friendly: [], aliases: [] },
      ],
      parts: [part], primary: [], others: [], groups: {}, primaryOptions: [],
    });
    const firstPath = join(root, 'first.html');
    await writeFile(firstPath, `<script>const DB=${JSON.stringify(minimalDb('original'))};</script>`);
    const first = await importCatalogue(firstPath, { dbPath, dataRoot: root });
    const db = new Database(dbPath);
    db.exec(`CREATE TRIGGER fail_staged_entry BEFORE INSERT ON catalog_entries
      WHEN NEW.source_row_ordinal=2 BEGIN SELECT RAISE(ABORT, 'injected batch failure'); END;`);
    db.prepare('UPDATE catalog_state SET active_version_id=? WHERE singleton=1').run(first.versionId);
    db.close();

    const secondPath = join(root, 'second.html');
    await writeFile(secondPath, `<script>const DB=${JSON.stringify(minimalDb('changed'))};</script>`);
    const failedSha = createHash('sha256').update(await readFile(secondPath)).digest('hex');
    await expect(importCatalogue(secondPath, { dbPath, dataRoot: root })).rejects.toThrow(/injected batch failure/);

    const check = new Database(dbPath, { readonly: true });
    try {
      expect(check.prepare('SELECT active_version_id FROM catalog_state WHERE singleton=1').get()).toEqual({ active_version_id: first.versionId });
      expect(check.prepare('SELECT status FROM catalog_versions WHERE source_sha256=?').get(failedSha)).toEqual({ status: 'failed' });
      const versions = check.prepare('SELECT status FROM catalog_versions ORDER BY created_at').all();
      expect(versions).toContainEqual({ status: 'validated' });
      expect(versions).toContainEqual({ status: 'failed' });
    } finally {
      check.close();
    }
  });

  it('retains normalized collisions as separate identities and leaves unknown targets unresolved', async () => {
    const root = await temporaryProject();
    const dbPath = join(root, 'catalogue.db');
    const sourceData = {
      rows: [
        { part: 'name one', models: ['Model A'], tech: 'ABC-01', log: 'LOG-01', price: 10, replacement: 'MISSING-01', friendly: ['Model A'], aliases: ['first alias'] },
        { part: 'name two', models: ['Model B'], tech: 'ABC-_01', log: 'LOG-_01', price: 20, replacement: '', friendly: [], aliases: [] },
      ],
      parts: ['name one', 'name two'], primary: [], others: [], groups: {}, primaryOptions: [],
    };
    const source = join(root, 'collision.html');
    await writeFile(source, `<script>const DB=${JSON.stringify(sourceData)};</script>`);
    const imported = await importCatalogue(source, { dbPath, dataRoot: root });
    const verification = await (await import('../../packages/importer/src/verify.js')).verifyCatalogue(imported.versionId, { dbPath, sourcePath: source });
    expect(verification.normalizedTechCollisionGroups).toBe(1);
    expect(verification.normalizedLogCollisionGroups).toBe(1);
    const db = new Database(dbPath, { readonly: true });
    try {
      const entries = db.prepare(`
        SELECT p.tech_raw, p.id AS part_id, e.log_raw
        FROM catalog_entries e JOIN parts p ON p.version_id=e.version_id AND p.id=e.part_id
        WHERE e.version_id=? ORDER BY e.source_row_ordinal
      `).all(imported.versionId);
      expect(entries).toHaveLength(2);
      expect(entries[0]).not.toEqual(entries[1]);
      expect(db.prepare(`
        SELECT COUNT(*) AS count FROM entry_search_documents esd
        JOIN search_documents d ON d.version_id=esd.version_id AND d.id=esd.doc_id
        WHERE d.version_id=? AND d.kind='tech' AND d.normalized_value='abc-01'
      `).get(imported.versionId)).toEqual({ count: 2 });
      expect(db.prepare(`
        SELECT token_raw, target_part_id FROM entry_replacements
        WHERE version_id=? ORDER BY ordinal
      `).get(imported.versionId)).toEqual({ token_raw: 'MISSING-01', target_part_id: null });
    } finally {
      db.close();
    }
  });

  it('blocks a technical code whose rows disagree on the part name', async () => {
    const root = await temporaryProject();
    const dbPath = join(root, 'catalogue.db');
    const source = join(root, 'conflicting-name.html');
    const dbValue = {
      rows: [
        { part: 'name one', models: [], tech: 'SAME-TECH', log: 'LOG-01', price: 1, replacement: '', friendly: [], aliases: [] },
        { part: 'name two', models: [], tech: 'SAME-TECH', log: 'LOG-02', price: 2, replacement: '', friendly: [], aliases: [] },
      ],
      parts: ['name one', 'name two'], primary: [], others: [], groups: {}, primaryOptions: [],
    };
    await writeFile(source, `<script>const DB=${JSON.stringify(dbValue)};</script>`);
    await expect(importCatalogue(source, { dbPath, dataRoot: root })).rejects.toThrow(/Conflicting part names/);
    const db = new Database(dbPath, { readonly: true });
    try {
      expect(db.prepare('SELECT active_version_id FROM catalog_state WHERE singleton=1').get()).toEqual({ active_version_id: null });
      expect(db.prepare("SELECT status FROM catalog_versions").all()).toContainEqual({ status: 'failed' });
    } finally {
      db.close();
    }
  });
});
