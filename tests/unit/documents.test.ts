import { describe, expect, it } from 'vitest';
import { addDocumentLine, createDocument, createLineSnapshot, documentTotals, priceForMode, transferLines, validateDocument, DEFAULT_PREFERENCES, validatePreferences } from '../../packages/domain/src/documents.js';
const entry = { entryId: 7, techRaw: '001-01', logRaw: '000007', partNameRaw: 'فیلتر روغن', basePrice: '9007199254740993', currencyUnit: 'UNKNOWN' as const, modelCount: 2 };
const vehicle = { id: 3, labelRaw: 'Tiggo 7', models: ['Tiggo7'], kind: 'main' as const, keywordsRaw: '', displayOrder: 0 };
describe('operational document snapshots', () => {
  it('snapshots exact entry identity and vehicle; never merges sibling logistics records', () => {
    const a = createLineSnapshot(entry, 'v1', vehicle, 'base');
    const b = createLineSnapshot({ ...entry, entryId: 8, logRaw: '000008' }, 'v1', vehicle, 'base');
    const doc = addDocumentLine(addDocumentLine(createDocument('invoice'), a), b);
    expect(doc.lines).toHaveLength(2); expect(a.entryId).toBe(7); expect(a.logisticsCode).toBe('000007');
    vehicle.models.push('should not mutate snapshot'); expect(a.vehicle?.models).toEqual(['Tiggo7']);
  });
  it('uses integer half-up markups directly on base and exact totals beyond Number safe range', () => {
    expect(priceForMode('1001', 'middle', null)).toBe('1101');
    expect(priceForMode('1001', 'final', null)).toBe('1201');
    expect(priceForMode('1001', 'custom', 1250)).toBe('1126');
    const line = { ...createLineSnapshot(entry, 'v1', null, 'base'), quantity: '3' };
    expect(documentTotals([line]).total).toBe('27021597764222979');
  });
  it('preserves manual price and quantities when transferring package lines', () => {
    const line = { ...createLineSnapshot(entry, 'v1', null, 'base'), priceMode: 'manual' as const, unitPrice: '12345678901234567890', quantity: '13' };
    const invoice = transferLines(createDocument('invoice'), [line]);
    expect(invoice.lines[0]).toMatchObject({ unitPrice: line.unitPrice, quantity: '13', priceMode: 'manual', entryId: 7, catalogueVersion: 'v1' });
    expect(invoice.lines[0]?.lineId).not.toBe(line.lineId);
  });
  it('rejects unsafe inputs instead of silently rounding or inventing units', () => {
    expect(() => priceForMode('1e3', 'base', null)).toThrow();
    expect(() => priceForMode('100', 'custom', -10001)).toThrow();
    const d = createDocument('invoice');
    expect(() => validateDocument({ ...d, lines: [{ ...createLineSnapshot(entry, 'v1', null, 'base'), quantity: '1.5' }] })).toThrow();
    expect(createLineSnapshot(entry, 'v1', null, 'base').currencyUnit).toBe('UNKNOWN');
  });
  it('validates an exact total larger than either bounded input', () => {
    const line = { ...createLineSnapshot(entry, 'v1', null, 'base'), unitPrice: '9'.repeat(80), quantity: '9'.repeat(80) };
    const doc = addDocumentLine(createDocument('invoice'), line);
    expect(validateDocument(doc).total).toBe((BigInt(line.unitPrice)*BigInt(line.quantity)).toString());
  });
  it('keeps classification boundaries separate and defaults packages to base', () => {
    expect(DEFAULT_PREFERENCES.defaultPackageTier).toBe('base');
    expect(validatePreferences(DEFAULT_PREFERENCES).priceClassification).toMatchObject({ strategy: 'threshold', mediumBps: 1000, highBps: 3000 });
    expect(validatePreferences({ ...DEFAULT_PREFERENCES, priceClassification: { ...DEFAULT_PREFERENCES.priceClassification, strategy: 'percentile', highBps: 20000 } }).priceClassification.highBps).toBe(20000);
    expect(() => validatePreferences({ ...DEFAULT_PREFERENCES, priceClassification: { strategy: 'percentile', mediumBps: 8000, highBps: 2000 } })).toThrow();
  });
});
