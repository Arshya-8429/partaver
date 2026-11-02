import type { DocumentCurrency, DocumentLine, PriceMode } from '../../../../packages/domain/src/documents.js';
export function escapeHTML(value: string): string { return value.replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x]!); }
export function money(value: string): string { try { return new Intl.NumberFormat('fa-IR').format(BigInt(value)); } catch { return value; } }
export function currencyLabel(unit: DocumentCurrency): string { return unit === 'IRR' ? 'ریال' : unit === 'TOMAN' ? 'تومان' : 'واحد اعلام نشده'; }
export function modeLabel(mode: PriceMode, bps: number | null): string { return mode === 'base' ? 'پایه' : mode === 'middle' ? 'میانی +۱۰٪' : mode === 'final' ? 'نهایی +۲۰٪' : mode === 'custom' ? `سفارشی ${(bps ?? 0) / 100}٪` : 'دستی'; }
export function vehicleLabel(line: DocumentLine): string { return line.vehicle?.label || (line.identityStatus === 'legacy-ambiguous' ? 'زمینهٔ خودروی قدیمی ثبت نشده' : line.compatibleModelCount ? `جستجوی سراسری · ${line.compatibleModelCount} مدل در ورودی دقیق` : 'عضویت خودرو ثبت نشده'); }
