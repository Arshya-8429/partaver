import { documentTotals, lineTotal, type OperationalDocument } from '../../../../packages/domain/src/documents.js';
import { currencyLabel, escapeHTML, modeLabel, vehicleLabel } from './format.js';
/** Small OOXML writer: UTF-8 XML in a standards-compliant ZIP with stored entries; no frontend spreadsheet dependency. */
function crc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function concat(arrays: Uint8Array[]): Uint8Array { const out = new Uint8Array(arrays.reduce((sum, a) => sum + a.length, 0)); let offset = 0; for (const a of arrays) { out.set(a, offset); offset += a.length; } return out; }
function header(length: number, entries: Array<[number, number, number]>): Uint8Array { const bytes = new Uint8Array(length), v = new DataView(bytes.buffer); for (const [offset, value, width] of entries) { if (width === 4) v.setUint32(offset, value, true); else v.setUint16(offset, value, true); } return bytes; }
function zip(files: Array<[string, string]>): Uint8Array {
  const local: Uint8Array[] = [], central: Uint8Array[] = []; let position = 0;
  for (const [name, content] of files) { const filename = new TextEncoder().encode(name), data = new TextEncoder().encode(content), crc = crc32(data);
    const h = header(30, [[0,0x04034b50,4],[4,20,2],[6,0x0800,2],[14,crc,4],[18,data.length,4],[22,data.length,4],[26,filename.length,2]]);
    local.push(h,filename,data);
    central.push(header(46, [[0,0x02014b50,4],[4,20,2],[6,20,2],[8,0x0800,2],[16,crc,4],[20,data.length,4],[24,data.length,4],[28,filename.length,2],[42,position,4]]),filename);
    position += h.length + filename.length + data.length;
  }
  const centralBytes = concat(central);
  return concat([...local,centralBytes,header(22,[[0,0x06054b50,4],[8,files.length,2],[10,files.length,2],[12,centralBytes.length,4],[16,position,4]])]);
}
function column(index: number): string { let result = ''; for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + ((n - 1) % 26)) + result; return result; }
export function documentToXlsx(doc: OperationalDocument): Uint8Array {
  const rows: string[][] = [[doc.name || (doc.kind === 'invoice' ? 'فاکتور قطعات' : doc.kind === 'purchase' ? 'لیست خرید' : 'پکیج قطعات')],['شماره',doc.documentNumber,'تاریخ',doc.date],['مشتری',doc.customer.name,'تلفن',doc.customer.phone,'مرجع',doc.customer.reference],['ردیف','نام قطعه','کد فنی','کد لجستیکی','خودرو / زمینه','تعداد','قیمت پایه','روش قیمت','درصد سفارشی','قیمت واحد','جمع ردیف','واحد','نسخه کاتالوگ','شناسه ورودی','وضعیت هویت'],
    ...doc.lines.map((line, index) => [String(index + 1),line.partName,line.technicalCode,line.logisticsCode,vehicleLabel(line),line.quantity,line.basePrice ?? '',modeLabel(line.priceMode,line.customBps),line.customBps === null ? '' : String(line.customBps / 100),line.unitPrice,lineTotal(line),currencyLabel(line.currencyUnit),line.catalogueVersion,line.entryId === null ? '' : String(line.entryId),line.identityStatus]),
    [],['تعداد کل',documentTotals(doc.lines).quantity],['جمع مقادیر ثبت‌شده',doc.total],['یادداشت',doc.notes], ...Object.entries(documentTotals(doc.lines).byCurrency).map(([unit,total]) => [`جمع ${currencyLabel(unit as 'UNKNOWN'|'IRR'|'TOMAN')}`,total!])];
  const sheetRows = rows.map((row,r) => `<row r="${r+1}">${row.map((value,c) => `<c r="${column(c)}${r+1}" t="inlineStr"${r===3?' s="1"':''}><is><t xml:space="preserve">${escapeHTML(value)}</t></is></c>`).join('')}</row>`).join('');
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  return zip([
    ['[Content_Types].xml',`${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels',`${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml',`${xml}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="PartAvar" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels',`${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml',`${xml}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Tahoma"/></font><font><b/><sz val="11"/><name val="Tahoma"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`],
    ['xl/worksheets/sheet1.xml',`${xml}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" rightToLeft="1"/></sheetViews><cols><col min="1" max="1" width="8" customWidth="1"/><col min="2" max="2" width="38" customWidth="1"/><col min="3" max="15" width="24" customWidth="1"/></cols><sheetData>${sheetRows}</sheetData></worksheet>`],
  ]);
}
export function downloadDocumentXlsx(doc: OperationalDocument): void { downloadBlob(new Blob([documentToXlsx(doc).buffer as ArrayBuffer], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), `PartAvar-${doc.kind}-${doc.date}.xlsx`); }
export function downloadBlob(blob: Blob, filename: string): void { const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
