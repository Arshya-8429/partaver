import { requiredElement } from './dom.js';
import { icon } from './icons.js';
const THEME_KEY = 'partsfinder-theme';
export function initializeTheme(): () => void {
  const toggle = requiredElement<HTMLButtonElement>('themeToggle');
  const system = matchMedia('(prefers-color-scheme: dark)');
  let saved: string | null = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch { /* Private storage may be unavailable. */ }
  const apply = (dark: boolean) => {
    document.body.classList.toggle('dark', dark);
    toggle.replaceChildren(icon(dark ? 'sun' : 'moon'));
    toggle.title = dark ? 'حالت روشن' : 'حالت تیره';
    toggle.setAttribute('aria-label', dark ? 'تغییر به حالت روشن' : 'تغییر به حالت تیره');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0C1422' : '#F5F7FA');
  };
  apply(saved === 'dark' || (saved !== 'light' && system.matches));
  const onSystem = () => { if (!saved) apply(system.matches); };
  const onClick = () => {
    saved = document.body.classList.contains('dark') ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, saved); } catch { /* The current session still changes theme. */ }
    apply(saved === 'dark');
  };
  toggle.addEventListener('click', onClick); system.addEventListener('change', onSystem);
  return () => { toggle.removeEventListener('click', onClick); system.removeEventListener('change', onSystem); };
}
