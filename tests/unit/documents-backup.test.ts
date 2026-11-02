import { describe, expect, it } from 'vitest';
import { createDocument, createLineSnapshot, addDocumentLine, DEFAULT_PREFERENCES } from '../../packages/domain/src/documents.js';
import { createOperationsBackup, parseOperationsImport, MAX_BACKUP_BYTES } from '../../apps/web/src/documents/backup.js';
describe('validated operational backup and legacy conversion', () => {
  it('round-trips snapshots and preferences without numeric conversion', () => {
    const d = addDocumentLine(createDocument('invoice'), createLineSnapshot({entryId: 3, techRaw:'000123',logRaw:'009-01',partNameRaw:'قطعه',basePrice:'9007199254740993123',currencyUnit:'UNKNOWN',modelCount:0}, 'v7', null, 'middle'));
    const backup = createOperationsBackup([d], DEFAULT_PREFERENCES, 'https://example.test');
    const imported = parseOperationsImport(JSON.stringify(backup));
    expect(imported.documents[0]?.lines[0]?.unitPrice).toBe('9907919180215092435');
    expect(imported.origin).toBe('https://example.test'); expect(imported.format).toBe('partavar');
  });
  it('rejects schema, excessive size, tampered totals and invalid prices', () => {
    expect(() => parseOperationsImport(' '.repeat(MAX_BACKUP_BYTES + 1))).toThrow();
    expect(() => parseOperationsImport('{"schema":"partavar.operations","schemaVersion":99}')).toThrow();
    const backup = createOperationsBackup([createDocument('purchase')], DEFAULT_PREFERENCES, 'https://example.test');
    backup.documents[0]!.total = '1';
    expect(() => parseOperationsImport(JSON.stringify(backup))).toThrow();
  });
  it('imports legacy storage keys honestly, retaining unresolved logistics and original values', () => {
    const input = { partsFinderInvoiceV29:[{tech:'00123',log:'0099',part:'قطعه',basePrice:1001,priceMode:'manual',unitPrice:4444,qty:3}], partsFinderPurchaseListV29:[{tech:'00123',part:'قطعه',models:['Tiggo 7']}],partsFinderSavedPackagesV30:[{name:'سرویس',items:[{tech:'00123',part:'قطعه',models:['Tiggo 7']}]}] };
    const result = parseOperationsImport(JSON.stringify(input));
    expect(result.format).toBe('legacy'); expect(result.documents).toHaveLength(3);
    const line = result.documents[0]?.lines[0];
    expect(line).toMatchObject({identityStatus:'legacy-ambiguous',entryId:null,catalogueVersion:'legacy:unresolved',technicalCode:'00123',logisticsCode:'0099',unitPrice:'4444',quantity:'3'});
    expect(line?.legacyOriginal).toEqual(input.partsFinderInvoiceV29[0]);
    expect(result.documents[1]?.lines[0]?.basePrice).toBeNull();
  });
  it('does not accept an arbitrary JSON object or silently round unsafe legacy numeric prices', () => {
    expect(() => parseOperationsImport('{}')).toThrow();
    expect(() => parseOperationsImport(JSON.stringify({partsFinderInvoiceV29:[{tech:'x',unitPrice:Number.MAX_SAFE_INTEGER+1,qty:1}]}))).toThrow();
  });
});
