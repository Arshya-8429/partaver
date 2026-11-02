const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Mirrors the original app's norm() transformation without mutating source values. */
export function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/\u200c/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ـ]/g, '')
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_INDIC_DIGITS.indexOf(digit)))
    .replace(/\s+/g, ' ');
}

/** Mirrors the original app's normCode(); leading zeroes and hyphens remain significant. */
export function normalizeCode(value: unknown): string {
  return normalizeText(value).replace(/[\s_]/g, '').replace(/[–—]/g, '-');
}

export function splitSearchTerms(value: string): string[] {
  return normalizeText(value).split(' ').filter(Boolean);
}
