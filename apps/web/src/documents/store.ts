import Dexie, { type Table } from 'dexie';
import { createDocument, DEFAULT_PREFERENCES, newDocumentId, refreshDocument, validateDocument, validatePreferences, type DocumentKind, type OperationalDocument, type OperatorPreferences } from '../../../../packages/domain/src/documents.js';
import { createOperationsBackup, type OperationsBackup, type OperationsImport } from './backup.js';
interface PreferenceRecord { key: 'operator'; value: OperatorPreferences }
/** Stable operational storage. Never write user documents into the read-only catalogue database. */
export class OperationsDatabase extends Dexie {
  documents!: Table<OperationalDocument, string>;
  preferences!: Table<PreferenceRecord, string>;
  constructor(name = 'PartAvarOperations') { super(name); this.version(1).stores({ documents: 'id,kind,status,updatedAt,[kind+status]', preferences: 'key' }); }
}
export const operationsDatabase = new OperationsDatabase();
export async function getPreferences(): Promise<OperatorPreferences> {
  const value = (await operationsDatabase.preferences.get('operator'))?.value;
  return value ? validatePreferences(value) : structuredClone(DEFAULT_PREFERENCES);
}
export async function savePreferences(value: OperatorPreferences): Promise<void> {
  await operationsDatabase.preferences.put({ key: 'operator', value: validatePreferences(value) });
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('partavar:preferences-changed', { detail: value }));
}
export async function getDraft(kind: DocumentKind): Promise<OperationalDocument> {
  const id = `draft-${kind}`, existing = await operationsDatabase.documents.get(id);
  if (existing) return validateDocument(existing);
  const draft = { ...createDocument(kind), id }; await operationsDatabase.documents.put(draft); return draft;
}
export async function saveDraft(value: OperationalDocument): Promise<OperationalDocument> {
  const draft = validateDocument(refreshDocument({ ...value, id: `draft-${value.kind}`, status: 'draft' }));
  await operationsDatabase.documents.put(draft); return draft;
}
export async function listSavedDocuments(kind: DocumentKind): Promise<OperationalDocument[]> {
  return (await operationsDatabase.documents.where('[kind+status]').equals([kind, 'saved']).toArray()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function saveToHistory(value: OperationalDocument): Promise<OperationalDocument> {
  const saved = validateDocument(refreshDocument({ ...structuredClone(value), id: value.sourceDocumentId ?? newDocumentId(value.kind), status: 'saved', sourceDocumentId: null }));
  await operationsDatabase.transaction('rw', operationsDatabase.documents, async () => { await operationsDatabase.documents.put(saved); await saveDraft({ ...value, sourceDocumentId: saved.id }); }); return saved;
}
export async function openSavedDocument(id: string, duplicate = false): Promise<OperationalDocument> {
  const saved = await operationsDatabase.documents.get(id);
  if (!saved || saved.status !== 'saved') throw new Error('سند ذخیره‌شده پیدا نشد.');
  return saveDraft({ ...structuredClone(saved), sourceDocumentId: duplicate ? null : saved.id, name: duplicate ? `${saved.name || 'سند'} (رونوشت)` : saved.name, documentNumber: duplicate ? '' : saved.documentNumber, createdAt: duplicate ? new Date().toISOString() : saved.createdAt });
}
export async function removeSavedDocument(id: string): Promise<void> {
  await operationsDatabase.transaction('rw', operationsDatabase.documents, async () => { const saved = await operationsDatabase.documents.get(id); if (!saved || saved.status !== 'saved') throw new Error('سند قابل حذف نیست.'); await operationsDatabase.documents.delete(id); const draft = await operationsDatabase.documents.get(`draft-${saved.kind}`); if (draft?.sourceDocumentId === id) await operationsDatabase.documents.put({ ...draft, sourceDocumentId: null }); });
}
export async function exportOperationsBackup(origin = globalThis.location?.origin ?? 'unknown'): Promise<OperationsBackup> { return createOperationsBackup(await operationsDatabase.documents.toArray(), await getPreferences(), origin); }
/** Import is additive: imported drafts become saved records; current work and existing history are never overwritten. */
export async function importOperationsData(data: OperationsImport, includePreferences: boolean): Promise<number> {
  await operationsDatabase.transaction('rw', operationsDatabase.documents, operationsDatabase.preferences, async () => {
    for (const source of data.documents) { const saved = validateDocument({ ...structuredClone(source), id: newDocumentId(source.kind), status: 'saved', sourceDocumentId: null }); await operationsDatabase.documents.add(saved); }
    if (includePreferences && data.preferences) await operationsDatabase.preferences.put({ key: 'operator', value: validatePreferences(data.preferences) });
  });
  if (includePreferences && data.preferences && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('partavar:preferences-changed', { detail: data.preferences }));
  return data.documents.length;
}
