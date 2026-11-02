export function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`The PartsFinder interface is missing #${id}.`);
  return element as T;
}

export function setHidden(element: HTMLElement, hidden: boolean): void {
  element.hidden = hidden;
  element.setAttribute('aria-hidden', String(hidden));
}

export function button(label: string, className: string, onClick: () => void, type: 'button' | 'submit' = 'button'): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = type;
  element.className = className;
  element.textContent = label;
  element.addEventListener('click', onClick);
  return element;
}
