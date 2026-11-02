import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { createDocument, createLineSnapshot, addDocumentLine, DEFAULT_PREFERENCES } from '../../packages/domain/src/documents.js';
import { documentToXlsx } from '../../apps/web/src/documents/xlsx.js';
import { renderPrintDocument } from '../../apps/web/src/documents/print.js';
const doc = addDocumentLine(createDocument('invoice'), { ...createLineSnapshot({entryId:9,techRaw:'000123-01',logRaw:'00000987',partNameRaw:'قطعه <script>',basePrice:'900719925474099312345',currencyUnit:'UNKNOWN',modelCount:1}, 'v1', {id:2,labelRaw:'Tiggo 7 Pro Max AWD',models:['M1']}, 'base'), quantity:'17', priceMode:'manual',unitPrice:'12345678901234567890' });
describe('real spreadsheet and print export', () => {
  it('reads the generated OOXML in a separate Node spreadsheet parser and preserves codes and large monetary strings', async () => {
    const bytes = documentToXlsx(doc);
    expect([...bytes.slice(0,4)]).toEqual([80,75,3,4]);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(bytes) as never);
    const sheet = workbook.worksheets[0]!;
    const values = [...sheet.getSheetValues()].flat(3);
    expect(values).toContain('000123-01'); expect(values).toContain('00000987');
    expect(values).toContain('12345678901234567890'); expect(values).toContain('209876541320987654130');
    expect(values).toContain('قطعه <script>');
  });
  it('renders escaped A4 semantic markup with exact LTR codes and no interactive controls', () => {
    const html = renderPrintDocument(doc, DEFAULT_PREFERENCES.printTemplate);
    expect(html).toContain('<thead>'); expect(html).toContain('dir="ltr"');
    expect(html).toContain('قطعه &lt;script&gt;'); expect(html).not.toContain('<script>');
    expect(html).toContain('000123-01'); expect(html).toContain('00000987');
    expect(html).not.toContain('<button'); expect(html).not.toContain('<input');
    expect(html).not.toContain('تومان'); expect(html).not.toContain('مالیات');
  });
});
