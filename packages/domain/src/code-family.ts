export interface CodeFamilyInfo {
  root: string;
  variant: string;
  full: string;
}

/** Legacy display-only heuristic. Never use this result to merge records or infer fitment. */
export function codeFamilyInfo(code: unknown): CodeFamilyInfo {
  const original = String(code ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!original) return { root: '—', variant: 'BASE', full: '—' };

  let core = original;
  let qualifier = '';
  const qualifierMatch = core.match(/^(.*\d[A-Z]{0,2})-([A-Z][A-Z0-9]{1,4})$/);
  if (qualifierMatch) {
    core = qualifierMatch[1] ?? core;
    qualifier = qualifierMatch[2] ?? '';
  }

  const revisionMatch = core.match(/^(.*\d)([A-Z]{2})$/);
  const root = revisionMatch?.[1] ?? core;
  const revision = revisionMatch?.[2] ?? '';
  return { root, variant: [revision, qualifier].filter(Boolean).join('-') || 'BASE', full: original };
}
