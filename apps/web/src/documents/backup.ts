import { createDocument, DEFAULT_PREFERENCES, newDocumentId, refreshDocument, validateDocument, validateLine, validatePreferences, type DocumentKind, type DocumentLine, type OperationalDocument, type OperatorPreferences } from '../../../../packages/domain/src/documents.js';
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export const LEGACY_KEYS = ['partsFinderInvoiceV29', 'partsFinderInvoiceV28', 'partsFinderInvoiceHistoryV29', 'partsFinderPurchaseListV29', 'partsFinderSavedPackagesV30'] as const;
export interface OperationsBackup { schema: 'partavar.operations'; schemaVersion: 1; exportedAt: string; origin: string; documents: OperationalDocument[]; preferences: OperatorPreferences }
export interface OperationsImport { format: 'partavar' | 'legacy'; origin: string; documents: OperationalDocument[]; preferences: OperatorPreferences | null; warnings: string[] }
export function createOperationsBackup(documents: OperationalDocument[], preferences: OperatorPreferences, origin: string): OperationsBackup {
  return { schema: 'partavar.operations', schemaVersion: 1, exportedAt: new Date().toISOString(), origin, documents: documents.map(validateDocument), preferences: validatePreferences(preferences) };
}
function obj(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('ساختار فایل معتبر نیست.'); return value as Record<string, unknown>; }
function legacyArray(value: unknown): unknown[] { if (typeof value === 'string') { try { value = JSON.parse(value) as unknown; } catch { throw new TypeError('دادهٔ قدیمی JSON معتبر نیست.'); } } if (!Array.isArray(value) || value.length > 10000) throw new TypeError('فهرست قدیمی معتبر نیست.'); return value; }
function legacyText(value: unknown): string { if (value === undefined || value === null) return ''; if (typeof value !== 'string' && typeof value !== 'number') throw new TypeError('متن قدیمی معتبر نیست.'); const result = String(value); if (result.length > 4000) throw new TypeError('متن قدیمی بیش از حد طولانی است.'); return result; }
function legacyInteger(value: unknown, fallback: string, positive = false): string {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) throw new TypeError('قیمت یا تعداد عددی قدیمی دقیق نیست؛ آن را به‌صورت رشتهٔ صحیح وارد کنید.');
  const raw = String(value); if (!/^(0|[1-9]\d{0,79})$/.test(raw) || (positive && raw === '0')) throw new TypeError('قیمت یا تعداد قدیمی معتبر نیست.'); return raw;
}
function legacyLine(value: unknown): DocumentLine {
  const x = obj(value);
  const models = x.models === undefined ? [] : legacyArray(x.models).map(legacyText);
  const mode = x.priceMode === 'mid' ? 'middle' : x.priceMode;
  const normalizedMode = ['base', 'middle', 'final', 'custom', 'manual'].includes(String(mode)) ? mode as DocumentLine['priceMode'] : 'manual';
  const customBps = normalizedMode === 'custom' ? Math.round(Number(x.percent ?? 0) * 100) : null;
  return validateLine({ lineId: newDocumentId('legacy-line'), catalogueVersion: 'legacy:unresolved', entryId: null, identityStatus: 'legacy-ambiguous', partName: legacyText(x.part ?? x.partName), technicalCode: legacyText(x.tech), logisticsCode: legacyText(x.log), vehicle: models.length ? { id: null, label: models.join('، '), models } : null, compatibleModelCount: null, basePrice: x.basePrice === undefined || x.basePrice === null ? null : legacyInteger(x.basePrice, '0'), currencyUnit: 'UNKNOWN', priceMode: normalizedMode, customBps, unitPrice: legacyInteger(x.unitPrice, '0'), quantity: legacyInteger(x.qty ?? x.quantity, '1', true), legacyOriginal: x });
}
function legacyDocument(kind: DocumentKind, items: unknown[], name = '', saved = true, source: Record<string, unknown> = {}): OperationalDocument {
  const doc = createDocument(kind);
  doc.status = saved ? 'saved' : 'draft'; doc.name = name; doc.lines = items.map(legacyLine);
  if (typeof source.createdAt === 'string' && Number.isFinite(Date.parse(source.createdAt))) doc.createdAt = source.createdAt;
  return refreshDocument(doc);
}
export function parseOperationsImport(raw: string): OperationsImport {
  if (new TextEncoder().encode(raw).byteLength > MAX_BACKUP_BYTES) throw new TypeError('حداکثر اندازهٔ فایل پشتیبان ۱۰ مگابایت است.');
  let value: unknown; try { value = JSON.parse(raw) as unknown; } catch { throw new TypeError('فایل JSON معتبر نیست.'); }
  const x = obj(value);
  if (x.schema !== undefined) {
    if (x.schema !== 'partavar.operations' || x.schemaVersion !== 1 || typeof x.origin !== 'string' || x.origin.length > 2000 || typeof x.exportedAt !== 'string' || !Number.isFinite(Date.parse(x.exportedAt))) throw new TypeError('نسخه یا مبدأ پشتیبان پشتیبانی نمی‌شود.');
    if (!Array.isArray(x.documents) || x.documents.length > 2000) throw new TypeError('تعداد اسناد پشتیبان معتبر نیست.');
    const documents = x.documents.map(validateDocument);
    if (documents.reduce((sum, d) => sum + d.lines.length, 0) > 10000) throw new TypeError('بیش از ۱۰۰۰۰ ردیف قابل ورود نیست.');
    if (new Set(documents.map(d => d.id)).size !== documents.length) throw new TypeError('شناسهٔ سند تکراری است.');
    return { format: 'partavar', origin: x.origin, documents, preferences: validatePreferences(x.preferences), warnings: ['اسناد واردشده با شناسهٔ جدید در سوابق ذخیره می‌شوند؛ پیش‌نویس فعلی جایگزین نمی‌شود.'] };
  }
  const hasLegacy = LEGACY_KEYS.some(key => x[key] !== undefined) || ['InvoiceHistoryV29', 'PurchaseListV29', 'SavedPackagesV30'].some(key => x[key] !== undefined);
  if (!hasLegacy) throw new TypeError('کلیدهای پشتیبان پارت‌آور یا نسخهٔ قدیمی پیدا نشد.');
  const documents: OperationalDocument[] = [];
  const invoice = x.partsFinderInvoiceV29 === undefined ? (x.partsFinderInvoiceV28 === undefined ? [] : legacyArray(x.partsFinderInvoiceV28)) : legacyArray(x.partsFinderInvoiceV29);
  const fallback = !invoice.length && x.partsFinderInvoiceV28 !== undefined ? legacyArray(x.partsFinderInvoiceV28) : invoice;
  if (fallback.length) documents.push(legacyDocument('invoice', fallback, 'فاکتور قدیمی'));
  const history = x.partsFinderInvoiceHistoryV29 ?? x.InvoiceHistoryV29;
  if (history !== undefined) for (const rec of legacyArray(history)) { const r = obj(rec); documents.push(legacyDocument('invoice', legacyArray(r.items), `فاکتور قدیمی ${legacyText(r.dateLabel)}`, true, r)); }
  const purchase = x.partsFinderPurchaseListV29 ?? x.PurchaseListV29;
  if (purchase !== undefined) { const rows = legacyArray(purchase); if (rows.length) documents.push(legacyDocument('purchase', rows, 'خرید قدیمی')); }
  const packages = x.partsFinderSavedPackagesV30 ?? x.SavedPackagesV30;
  if (packages !== undefined) for (const rec of legacyArray(packages)) { const r = obj(rec); documents.push(legacyDocument('package', legacyArray(r.items), legacyText(r.name) || 'پکیج قدیمی', true, r)); }
  if (documents.length > 2000 || documents.reduce((sum, d) => sum + d.lines.length, 0) > 10000) throw new TypeError('حجم اسناد قدیمی بیش از حد مجاز است.');
  return { format: 'legacy', origin: 'legacy:provided-json-or-current-origin', documents, preferences: null, warnings: ['هویت کاتالوگ و لجستیک قدیمی حل نشده است؛ هیچ تطبیقی حدس زده نشد.', 'واحد پول دادهٔ قدیمی اعلام نشده است. فایل HTML قدیمی در مبدأ دیگر به‌طور خودکار در دسترس نیست.'] };
}
export function currentOriginLegacyJSON(storage: Pick<Storage, 'getItem'>): string | null {
  const data: Record<string, unknown> = {};
  for (const key of LEGACY_KEYS) { const value = storage.getItem(key); if (value !== null) data[key] = value; }
  return Object.keys(data).length ? JSON.stringify(data) : null;
}
export const emptyBackupPreferences = (): OperatorPreferences => structuredClone(DEFAULT_PREFERENCES);
