import { requiredElement } from './dom.js';

const element = requiredElement<HTMLDivElement>('message');
let timer = 0;

export function showMessage(message: string, kind: 'info' | 'warn' = 'info', duration = 4200): void {
  window.clearTimeout(timer);
  element.textContent = message;
  element.className = `message show ${kind}`;
  if (duration > 0) timer = window.setTimeout(() => { element.className = 'message'; }, duration);
}

export function clearMessage(): void {
  window.clearTimeout(timer);
  element.textContent = '';
  element.className = 'message';
}
