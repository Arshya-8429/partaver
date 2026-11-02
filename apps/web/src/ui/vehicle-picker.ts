import type { VehicleOption } from '@partsfinder/contracts';
import type { Catalogue } from '../catalogue.js';
import { requiredElement, setHidden } from './dom.js';

export class VehiclePicker {
  private readonly input = requiredElement<HTMLInputElement>('vehicle');
  private readonly list = requiredElement<HTMLDivElement>('vehicleSuggestions');
  private version: string | null = null;
  private options: VehicleOption[] = [];
  private selected: VehicleOption | null = null;
  private activeIndex = -1;
  private timer = 0;
  private sequence = 0;
  private readonly clearButton = requiredElement<HTMLButtonElement>('vehicleClear');

  constructor(private readonly worker: Catalogue, private readonly onChange: () => void) {
    this.clearButton.addEventListener('click', () => { this.clear(); this.input.focus(); });
    this.input.addEventListener('input', this.handleInput);
    this.input.addEventListener('keydown', this.handleKeyDown);
    this.input.addEventListener('focus', this.handleFocus);
    document.addEventListener('pointerdown', this.handleOutsidePointer);
  }

  get selectedOption(): VehicleOption | null { return this.selected; }

  async setVersion(version: string | null): Promise<void> {
    if (this.version === version) return;
    this.sequence++;
    this.version = version;
    this.selected = null;
    this.options = [];
    this.input.value = ''; this.clearButton.hidden = true; delete this.input.dataset.selected;
    this.render([], false);
    if (!version) return;
    try {
      const options = await this.worker.vehicles(version, '', 80);
      if (version === this.version) this.options = options;
    } catch { this.options = []; }
  }

  select(option: VehicleOption): void {
    this.selected = option;
    this.input.value = option.labelRaw;
    this.clearButton.hidden = false;
    this.input.dataset.selected = 'true';
    this.sequence++;
    this.close();
    this.onChange();
  }

  clear(): void {
    this.sequence++; window.clearTimeout(this.timer);
    this.selected = null; this.input.value = ''; this.clearButton.hidden = true;
    delete this.input.dataset.selected; this.close(); this.onChange();
  }

  destroy(): void {
    window.clearTimeout(this.timer);
    this.input.removeEventListener('input', this.handleInput);
    this.input.removeEventListener('keydown', this.handleKeyDown);
    this.input.removeEventListener('focus', this.handleFocus);
    document.removeEventListener('pointerdown', this.handleOutsidePointer);
  }

  private readonly handleInput = (): void => {
    this.selected = null; this.sequence++; this.close();
    delete this.input.dataset.selected;
    this.clearButton.hidden = !this.input.value;
    this.onChange();
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { void this.filter(); }, 180);
  };

  private readonly handleFocus = (): void => {
    if (this.input.value && this.version) void this.filter();
  };

  private readonly handleOutsidePointer = (event: PointerEvent): void => {
    if (!this.list.parentElement?.contains(event.target as Node)) { this.sequence++; clearTimeout(this.timer); this.close(); }
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !this.isOpen()) {
      event.preventDefault();
      void this.filter().then(() => {
        if (!this.isOpen()) return;
        const options = this.list.querySelectorAll<HTMLButtonElement>('.vehicleOption');
        this.activeIndex = event.key === 'ArrowUp' ? options.length - 1 : 0;
        this.updateActive(options);
      });
      return;
    }
    const visible = this.list.querySelectorAll<HTMLButtonElement>('.vehicleOption');
    if (event.key === 'ArrowDown' && visible.length) {
      event.preventDefault();
      this.activeIndex = Math.min(this.activeIndex + 1, visible.length - 1);
      this.updateActive(visible);
    } else if (event.key === 'ArrowUp' && visible.length) {
      event.preventDefault();
      this.activeIndex = Math.max(this.activeIndex - 1, 0);
      this.updateActive(visible);
    } else if (event.key === 'Enter' && this.isOpen() && visible.length) {
      event.preventDefault();
      const options = this.optionsForVisible();
      const exact = options.filter(option => option.labelRaw.toLocaleLowerCase() === this.input.value.trim().toLocaleLowerCase());
      const option = this.activeIndex >= 0 ? options[this.activeIndex] : exact.length === 1 ? exact[0] : undefined;
      if (option) this.select(option);
    } else if (event.key === 'Escape') {
      this.sequence++; window.clearTimeout(this.timer); this.close();
      if (this.selected) this.input.value = this.selected.labelRaw;
    } else if (event.key === 'Tab') { this.sequence++; this.close(); }
  };

  private async filter(): Promise<void> {
    if (!this.version) return;
    const query = this.input.value.trim();
    const version = this.version; const sequence = ++this.sequence;
    try {
      const options = query ? await this.worker.vehicles(version, query, 80) : this.options;
      if (sequence !== this.sequence || version !== this.version || this.input.value.trim() !== query) return;
      this.render(options);
    } catch (error) {
      if (sequence !== this.sequence || version !== this.version) return;
      this.render([]);
      if (error instanceof Error) this.list.setAttribute('aria-label', error.message);
    }
  }

  private optionsForVisible(): VehicleOption[] {
    const ids = [...this.list.querySelectorAll<HTMLButtonElement>('.vehicleOption')].map((element) => Number(element.dataset.optionId));
    return ids.flatMap((id) => { const option = this.renderedOptions.get(id); return option ? [option] : []; });
  }

  private renderedOptions = new Map<number, VehicleOption>();

  private render(options: VehicleOption[], open = true): void {
    this.list.replaceChildren();
    this.renderedOptions = new Map(options.map((option) => [option.id, option]));
    this.activeIndex = -1;
    if (!options.length) {
      const empty = document.createElement('div');
      empty.className = 'vehicleNoResult';
      empty.textContent = this.version ? 'خودرویی با این عبارت پیدا نشد.' : 'ابتدا کاتالوگ را دریافت کنید.';
      this.list.append(empty);
    } else {
      const groups: Array<{ kind: VehicleOption['kind']; label: string }> = [
        { kind: 'main', label: 'مدل‌های اصلی' }, { kind: 'other', label: 'مدل‌های دیگر' },
      ];
      for (const group of groups) {
        const rows = options.filter((option) => option.kind === group.kind);
        if (!rows.length) continue;
        const heading = document.createElement('div');
        heading.className = 'suggestGroup';
        heading.textContent = group.label;
        this.list.append(heading);
        for (const option of rows) {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'vehicleOption';
          item.role = 'option'; item.tabIndex = -1;
          item.id = `vehicle-option-${option.id}`;
          item.dataset.optionId = String(option.id);
          item.setAttribute('aria-selected', String(this.selected?.id === option.id));
          const label = document.createElement('span');
          label.textContent = option.labelRaw;
          const badge = document.createElement('span');
          badge.className = 'vehicleBadge';
          badge.textContent = option.kind === 'main' ? 'اصلی' : 'دیگر';
          item.append(label, badge);
          item.addEventListener('click', () => this.select(option));
          this.list.append(item);
        }
      }
    }
    if (open) this.open();
    else this.close();
  }

  private updateActive(buttons: NodeListOf<HTMLButtonElement>): void {
    buttons.forEach((item, index) => {
      item.classList.toggle('active', index === this.activeIndex);
      item.setAttribute('aria-selected', String(Number(item.dataset.optionId) === this.selected?.id));
    });
    const active = buttons[this.activeIndex];
    if (active) {
      this.input.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    }
  }

  private open(): void {
    this.list.classList.add('show');
    setHidden(this.list, false);
    this.input.setAttribute('aria-expanded', 'true');
  }

  private close(): void {
    this.list.classList.remove('show');
    setHidden(this.list, true);
    this.input.removeAttribute('aria-activedescendant');
    this.input.setAttribute('aria-expanded', 'false');
  }

  private isOpen(): boolean { return this.list.classList.contains('show'); }
}
