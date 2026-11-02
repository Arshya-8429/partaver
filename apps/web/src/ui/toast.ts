import { requiredElement } from './dom.js';
let timer = 0;
export function toast(message: string, warning = false): void {
  const target = requiredElement('toast');
  clearTimeout(timer); target.textContent = message; target.className = `toast show${warning ? ' warn' : ''}`;
  timer = window.setTimeout(() => { target.className = 'toast'; }, 4000);
}
export async function copyText(value: string, label: string): Promise<void> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(value); toast(`${label} کپی شد.`);
  } catch { toast('کپی انجام نشد؛ متن کد را انتخاب و دستی کپی کنید.', true); }
}
