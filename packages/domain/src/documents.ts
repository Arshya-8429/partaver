/** Mutable operational documents are independent of the immutable catalogue. All monetary values are decimal integers. */
export type DocumentKind = 'invoice' | 'purchase' | 'package';
export type PriceMode = 'base' | 'middle' | 'final' | 'custom' | 'manual';
export type PackageTier = 'base' | 'middle' | 'final';
export type DocumentCurrency = 'UNKNOWN' | 'IRR' | 'TOMAN';
export interface VehicleSnapshot { id: number | null; label: string; models: string[] }
export interface DocumentLine {
  lineId: string;
  catalogueVersion: string;
  entryId: number | null;
  identityStatus: 'exact' | 'legacy-ambiguous';
  partName: string;
  technicalCode: string;
  logisticsCode: string;
  vehicle: VehicleSnapshot | null;
  /** Global additions retain an exact entry fitment reference; model membership is never inferred. */
  compatibleModelCount: number | null;
  basePrice: string | null;
  currencyUnit: DocumentCurrency;
  priceMode: PriceMode;
  customBps: number | null;
  unitPrice: string;
  quantity: string;
  legacyOriginal?: Record<string, unknown>;
}
export interface CustomerSnapshot { name: string; phone: string; reference: string }
export interface OperationalDocument {
  id: string;
  kind: DocumentKind;
  status: 'draft' | 'saved';
  sourceDocumentId: string | null;
  name: string;
  documentNumber: string;
  date: string;
  customer: CustomerSnapshot;
  notes: string;
  createdAt: string;
  updatedAt: string;
  sourceVersions: string[];
  lines: DocumentLine[];
  total: string;
}
export interface PrintTemplate {
  companyName: string;
  documentTitle: string;
  footer: string;
  showDocumentNumber: boolean;
  showDate: boolean;
  showCustomer: boolean;
  showNotes: boolean;
  showLogisticsCode: boolean;
  showVehicle: boolean;
}
export interface OperatorPreferences {
  defaultPackageTier: PackageTier;
  priceClassification: { strategy: 'threshold' | 'percentile'; mediumBps: number; highBps: number; mediumPercentileBps: number; highPercentileBps: number; minimumObservations: number };
  printTemplate: PrintTemplate;
}
export const DEFAULT_PREFERENCES: OperatorPreferences = {
  defaultPackageTier: 'base',
  priceClassification: { strategy: 'threshold', mediumBps: 1000, highBps: 3000, mediumPercentileBps: 3333, highPercentileBps: 6667, minimumObservations: 2 },
  printTemplate: { companyName: 'پارت‌آور', documentTitle: 'فاکتور قطعات', footer: '', showDocumentNumber: true, showDate: true, showCustomer: true, showNotes: true, showLogisticsCode: true, showVehicle: true },
};
export function newDocumentId(prefix = 'doc'): string { return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`; }
export function integerString(value: unknown, positive = false): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,79})$/.test(value) || (positive && value === '0')) throw new TypeError(positive ? 'Quantity must be a positive integer string' : 'Price must be a non-negative integer string');
  return value;
}
export function priceForMode(basePrice: string, mode: Exclude<PriceMode, 'manual'>, customBps: number | null): string {
  const base = BigInt(integerString(basePrice));
  const bps = mode === 'middle' ? 1000 : mode === 'final' ? 2000 : mode === 'custom' ? customBps : 0;
  if (bps === null || !Number.isSafeInteger(bps) || bps < -10000 || bps > 1000000) throw new TypeError('Invalid markup basis points');
  return ((base * BigInt(10000 + bps) + 5000n) / 10000n).toString();
}
export interface EntrySnapshotInput { entryId: number; techRaw: string; logRaw: string; partNameRaw: string; basePrice: string; currencyUnit: DocumentCurrency; modelCount: number }
export interface VehicleSnapshotInput { id: number; labelRaw: string; models: string[] }
export function createLineSnapshot(entry: EntrySnapshotInput, version: string, vehicle: VehicleSnapshotInput | null, mode: PackageTier | 'custom', customBps: number | null = null, quantity = '1'): DocumentLine {
  return validateLine({ lineId: newDocumentId('line'), catalogueVersion: version, entryId: entry.entryId, identityStatus: 'exact', partName: entry.partNameRaw, technicalCode: entry.techRaw, logisticsCode: entry.logRaw,
    vehicle: vehicle ? { id: vehicle.id, label: vehicle.labelRaw, models: [...vehicle.models] } : null, compatibleModelCount: entry.modelCount,
    basePrice: entry.basePrice, currencyUnit: entry.currencyUnit, priceMode: mode, customBps: mode === 'custom' ? customBps : null, unitPrice: priceForMode(entry.basePrice, mode, customBps), quantity });
}
export function documentTotals(lines: readonly DocumentLine[]): { total: string; quantity: string; byCurrency: Partial<Record<DocumentCurrency, string>> } {
  let total = 0n, quantity = 0n;
  const byCurrency: Partial<Record<DocumentCurrency, string>> = {};
  for (const line of lines) { const sum = BigInt(integerString(line.unitPrice)) * BigInt(integerString(line.quantity, true)); total += sum; quantity += BigInt(line.quantity); byCurrency[line.currencyUnit] = (BigInt(byCurrency[line.currencyUnit] ?? '0') + sum).toString(); }
  return { total: total.toString(), quantity: quantity.toString(), byCurrency };
}
export function lineTotal(line: DocumentLine): string { return (BigInt(integerString(line.unitPrice)) * BigInt(integerString(line.quantity, true))).toString(); }
export function createDocument(kind: DocumentKind): OperationalDocument {
  const now = new Date().toISOString();
  return { id: newDocumentId(kind), kind, status: 'draft', sourceDocumentId: null, name: '', documentNumber: '', date: now.slice(0, 10), customer: { name: '', phone: '', reference: '' }, notes: '', createdAt: now, updatedAt: now, sourceVersions: [], lines: [], total: '0' };
}
export function refreshDocument(doc: OperationalDocument): OperationalDocument {
  return { ...doc, updatedAt: new Date().toISOString(), sourceVersions: [...new Set(doc.lines.map(line => line.catalogueVersion))], total: documentTotals(doc.lines).total };
}
/** Separate additions remain separate lines, even if technical codes match. */
export function addDocumentLine(doc: OperationalDocument, line: DocumentLine): OperationalDocument { return refreshDocument({ ...doc, lines: [...doc.lines, structuredClone(validateLine(line))] }); }
export function transferLines(target: OperationalDocument, lines: readonly DocumentLine[]): OperationalDocument {
  return refreshDocument({ ...target, lines: [...target.lines, ...lines.map(line => ({ ...structuredClone(validateLine(line)), lineId: newDocumentId('line') }))] });
}
function totalString(value: unknown): string { if(typeof value!=='string'||!/^(0|[1-9]\d{0,199})$/.test(value))throw new TypeError('Invalid total');return value; }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected an object'); return value as Record<string, unknown>; }
function text(value: unknown, max = 4000): string { if (typeof value !== 'string' || value.length > max) throw new TypeError('Invalid or oversized text'); return value; }
function enumeration<T extends string>(value: unknown, values: readonly T[]): T { if (!values.includes(value as T)) throw new TypeError('Unsupported enum value'); return value as T; }
function nullableId(value: unknown): number | null { if (value === null) return null; if (!Number.isSafeInteger(value) || Number(value) < 0) throw new TypeError('Invalid identity'); return Number(value); }
function stringArray(value: unknown, max = 1000): string[] { if (!Array.isArray(value) || value.length > max) throw new TypeError('Invalid array'); return value.map(v => text(v)); }
export function validateLine(value: unknown): DocumentLine {
  const x = object(value), vehicle = x.vehicle === null ? null : object(x.vehicle);
  const mode = enumeration(x.priceMode, ['base', 'middle', 'final', 'custom', 'manual'] as const);
  const bps = x.customBps;
  if (bps !== null && (!Number.isSafeInteger(bps) || Number(bps) < -10000 || Number(bps) > 1000000)) throw new TypeError('Invalid markup');
  if (mode === 'custom' && bps === null) throw new TypeError('Custom markup missing');
  const line: DocumentLine = { lineId: text(x.lineId, 200), catalogueVersion: text(x.catalogueVersion, 200), entryId: nullableId(x.entryId), identityStatus: enumeration(x.identityStatus, ['exact', 'legacy-ambiguous'] as const), partName: text(x.partName), technicalCode: text(x.technicalCode), logisticsCode: text(x.logisticsCode),
    vehicle: vehicle ? { id: nullableId(vehicle.id), label: text(vehicle.label), models: stringArray(vehicle.models) } : null, compatibleModelCount: nullableId(x.compatibleModelCount), basePrice: x.basePrice === null ? null : integerString(x.basePrice), currencyUnit: enumeration(x.currencyUnit, ['UNKNOWN', 'IRR', 'TOMAN'] as const), priceMode: mode, customBps: bps as number | null, unitPrice: integerString(x.unitPrice), quantity: integerString(x.quantity, true) };
  if (!line.lineId || !line.catalogueVersion) throw new TypeError('Missing snapshot identity');
  if (line.identityStatus === 'exact' && (line.entryId === null || line.basePrice === null)) throw new TypeError('Exact entry requires catalogue identity and base price');
  if (x.legacyOriginal !== undefined) line.legacyOriginal = structuredClone(object(x.legacyOriginal));
  return line;
}
export function validateDocument(value: unknown): OperationalDocument {
  const x = object(value), customer = object(x.customer);
  if (!Array.isArray(x.lines) || x.lines.length > 10000) throw new TypeError('Invalid document line count');
  const lines = x.lines.map(validateLine);
  const doc: OperationalDocument = { id: text(x.id, 200), kind: enumeration(x.kind, ['invoice', 'purchase', 'package'] as const), status: enumeration(x.status, ['draft', 'saved'] as const), sourceDocumentId: x.sourceDocumentId === null ? null : text(x.sourceDocumentId, 200), name: text(x.name, 500), documentNumber: text(x.documentNumber, 500), date: text(x.date, 100), customer: { name: text(customer.name), phone: text(customer.phone), reference: text(customer.reference) }, notes: text(x.notes, 20000), createdAt: text(x.createdAt, 100), updatedAt: text(x.updatedAt, 100), sourceVersions: stringArray(x.sourceVersions), lines, total: totalString(x.total) };
  if (!doc.id || !Number.isFinite(Date.parse(doc.createdAt)) || !Number.isFinite(Date.parse(doc.updatedAt))) throw new TypeError('Invalid document identity/date');
  if (new Set(lines.map(line => line.lineId)).size !== lines.length) throw new TypeError('Duplicate line identity');
  if (documentTotals(lines).total !== doc.total) throw new TypeError('Document total mismatch');
  const versions = [...new Set(lines.map(line => line.catalogueVersion))].sort();
  if (JSON.stringify([...new Set(doc.sourceVersions)].sort()) !== JSON.stringify(versions)) throw new TypeError('Source version mismatch');
  return doc;
}
export function validatePreferences(value: unknown): OperatorPreferences {
  const x = object(value), c = object(x.priceClassification), t = object(x.printTemplate);
  const strategy = enumeration(c.strategy, ['threshold', 'percentile'] as const);
  const medium = Number(c.mediumBps), high = Number(c.highBps);
  if (!Number.isSafeInteger(medium) || !Number.isSafeInteger(high) || medium < 0 || high <= medium || high > 1000000) throw new TypeError('Invalid classification boundaries');
  for (const key of ['showDocumentNumber', 'showDate', 'showCustomer', 'showNotes', 'showLogisticsCode', 'showVehicle']) if (typeof t[key] !== 'boolean') throw new TypeError('Invalid print option');
  const mediumPercentileBps = c.mediumPercentileBps === undefined ? 3333 : Number(c.mediumPercentileBps), highPercentileBps = c.highPercentileBps === undefined ? 6667 : Number(c.highPercentileBps), minimumObservations = c.minimumObservations === undefined ? 2 : Number(c.minimumObservations);
  if (!Number.isSafeInteger(mediumPercentileBps) || !Number.isSafeInteger(highPercentileBps) || mediumPercentileBps < 0 || highPercentileBps <= mediumPercentileBps || highPercentileBps > 10000 || !Number.isSafeInteger(minimumObservations) || minimumObservations < 2 || minimumObservations > 1000) throw new TypeError('Invalid percentile/history settings');
  return { defaultPackageTier: enumeration(x.defaultPackageTier, ['base', 'middle', 'final'] as const), priceClassification: { strategy, mediumBps: medium, highBps: high, mediumPercentileBps, highPercentileBps, minimumObservations }, printTemplate: { companyName: text(t.companyName, 500), documentTitle: text(t.documentTitle, 500), footer: text(t.footer, 4000), showDocumentNumber: t.showDocumentNumber as boolean, showDate: t.showDate as boolean, showCustomer: t.showCustomer as boolean, showNotes: t.showNotes as boolean, showLogisticsCode: t.showLogisticsCode as boolean, showVehicle: t.showVehicle as boolean } };
}
