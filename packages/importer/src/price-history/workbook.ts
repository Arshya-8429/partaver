import ExcelJS from 'exceljs';
import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 100 * 1024 * 1024;
/** Bound the ZIP container before ExcelJS inflates it; ZIP64/encryption/nested paths are unsupported. */
export function validateWorkbookZip(bytes: Buffer): void {
  if (bytes.length > MAX_FILE_BYTES || bytes.length < 22 || bytes.readUInt32LE(0) !== 0x04034b50) throw new Error('Workbook is not a supported bounded XLSX ZIP.');
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0 || bytes.readUInt16LE(end + 8) !== bytes.readUInt16LE(end + 10)) throw new Error('Unsupported XLSX ZIP directory.');
  const count = bytes.readUInt16LE(end + 10);
  const directorySize = bytes.readUInt32LE(end + 12);
  let position = bytes.readUInt32LE(end + 16);
  if (count < 1 || count > 4096 || position + directorySize !== end) throw new Error('XLSX archive exceeds supported bounds.');
  let expanded = 0;
  const names = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (position + 46 > end || bytes.readUInt32LE(position) !== 0x02014b50) throw new Error('Invalid XLSX archive entry.');
    const flags = bytes.readUInt16LE(position + 8);
    const compression = bytes.readUInt16LE(position + 10);
    const compressedSize = bytes.readUInt32LE(position + 20);
    const size = bytes.readUInt32LE(position + 24);
    const length = bytes.readUInt16LE(position + 28);
    const extra = bytes.readUInt16LE(position + 30);
    const comment = bytes.readUInt16LE(position + 32);
    const name = bytes.subarray(position + 46, position + 46 + length).toString('utf8');
    const offset = bytes.readUInt32LE(position + 42);
    expanded += size;
    if ((flags & 1) || ![0, 8].includes(compression) || size === 0xffffffff || expanded > MAX_EXPANDED_BYTES || !name || name.startsWith('/') || name.includes('\\') || name.split('/').includes('..') || names.has(name) || position + 46 + length + extra + comment > end || offset + 30 > bytes.length || bytes.readUInt32LE(offset) !== 0x04034b50) throw new Error('Unsafe or oversized XLSX archive entry.');
    if (bytes.readUInt16LE(offset + 6) !== flags || bytes.readUInt16LE(offset + 8) !== compression) throw new Error('XLSX ZIP metadata mismatch.');
    const localNameLength = bytes.readUInt16LE(offset + 26);
    if (bytes.subarray(offset + 30, offset + 30 + localNameLength).toString('utf8') !== name) throw new Error('XLSX ZIP filename mismatch.');
    const dataStart = offset + 30 + localNameLength + bytes.readUInt16LE(offset + 28);
    if (dataStart + compressedSize > bytes.readUInt32LE(end + 16)) throw new Error('XLSX ZIP entry data overlaps its directory.');
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    const actual = compression === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: Math.max(1, size) });
    if (actual.length !== size) throw new Error('XLSX expanded size differs from its directory.');
    names.add(name);
    position += 46 + length + extra + comment;
  }
  if (position !== end || !names.has('[Content_Types].xml') || !names.has('xl/workbook.xml')) throw new Error('Missing XLSX workbook structures.');
}

export async function readHistoryWorkbook(sourcePath: string): Promise<{ bytes: Buffer; workbook: ExcelJS.Workbook; sheets: string[] }> {
  if (extname(sourcePath).toLowerCase() !== '.xlsx') throw new Error('Only .xlsx is supported; convert .xls to reviewed XLSX without changing text codes.');
  if ((await stat(sourcePath)).size > MAX_FILE_BYTES) throw new Error('Workbook exceeds 20 MiB.');
  const bytes = await readFile(sourcePath);
  validateWorkbookZip(bytes);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  if (workbook.worksheets.length > 100) throw new Error('Workbook contains more than 100 worksheets.');
  for (const sheet of workbook.worksheets) if (sheet.rowCount > 100001 || sheet.columnCount > 256) throw new Error('Worksheet exceeds 100,000 rows or 256 columns.');
  return { bytes, workbook, sheets: workbook.worksheets.map(sheet => sheet.name) };
}

export function explicitCellValue(cell: ExcelJS.Cell): string | number | Date | null {
  if (cell.isMerged) throw new TypeError('Merged historical input cells are unsupported.');
  const value = cell.value;
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || value instanceof Date) return value;
  // Formula results are cached assertions, not trusted source values. Hyperlinks and rich text
  // may hide a second representation, so operators must convert these to plain source cells.
  throw new TypeError('Formula, error, hyperlink and rich-text cells require reviewed plain values.');
}
