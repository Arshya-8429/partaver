import type { VehicleOption } from '@partsfinder/contracts';
import type { Catalogue } from '../catalogue.js';
import { requiredElement } from './dom.js';

type PresetFamily = { key: string; label: string; options: VehicleOption[] };

export class PresetController {
  private readonly familyList = requiredElement<HTMLDivElement>('quickFamilies');
  private readonly drawer = requiredElement<HTMLDivElement>('presetDrawer');
  private readonly title = requiredElement<HTMLElement>('presetDrawerTitle');
  private readonly variants = requiredElement<HTMLDivElement>('quickModels');
  private readonly toggle = requiredElement<HTMLButtonElement>('presetDrawerToggle');
  private families: PresetFamily[] = [];
  private selectedFamily: string | null = null;
  private selectedOptionId: number | null = null;
  private version: string | null = null;

  constructor(private readonly worker: Catalogue, private readonly onSelect: (option: VehicleOption) => void) {
    this.toggle.addEventListener('click', this.handleToggle);
  }

  async setVersion(version: string | null): Promise<void> {
    if (version === this.version) return;
    this.version = version;
    this.families = [];
    this.selectedFamily = null;
    this.selectedOptionId = null;
    this.familyList.replaceChildren();
    this.variants.replaceChildren();
    this.drawer.hidden = true;
    this.drawer.classList.remove('motion-open');
    if (!version) return;
    try {
      const families = await this.worker.presets(version);
      if (version !== this.version) return;
      this.families = families; this.renderFamilies();
    } catch { this.families = []; }
  }

  setSelected(optionId: number | null): void {
    this.selectedOptionId = optionId;
    this.variants.querySelectorAll<HTMLButtonElement>('.presetVariant').forEach((element) => {
      const selected = Number(element.dataset.optionId) === optionId;
      element.classList.toggle('selected', selected);
      element.setAttribute('aria-pressed', String(selected));
    });
  }

  destroy(): void { this.toggle.removeEventListener('click', this.handleToggle); }

  private readonly handleToggle = (): void => {
    const open = this.toggle.getAttribute('aria-expanded') === 'true';
    this.toggle.setAttribute('aria-expanded', String(!open));
    this.toggle.setAttribute('aria-label', open ? 'باز کردن تیپ‌ها' : 'بستن تیپ‌ها');
    this.toggle.textContent = open ? '▼' : '▲';
    this.drawer.hidden = true;
    this.selectedFamily = null;
    this.familyList.querySelectorAll('button').forEach(button => { button.classList.remove('active'); button.setAttribute('aria-expanded', 'false'); });
  };

  private renderFamilies(): void {
    this.familyList.replaceChildren();
    for (const family of this.families) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'presetFamily';
      button.dataset.family = family.key;
      button.setAttribute('aria-expanded', 'false');
      const label = document.createElement('span');
      label.textContent = family.label;
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = '▼';
      button.append(label, arrow);
      button.addEventListener('click', () => this.openFamily(family));
      this.familyList.append(button);
    }
  }

  private openFamily(family: PresetFamily): void {
    if (!this.version) return;
    const closing = this.selectedFamily === family.key && !this.drawer.hidden;
    this.familyList.querySelectorAll<HTMLButtonElement>('.presetFamily').forEach((element) => {
      const active = element.dataset.family === family.key && !closing;
      element.classList.toggle('active', active);
      element.setAttribute('aria-expanded', String(active));
    });
    if (closing) {
      this.selectedFamily = null;
      this.drawer.classList.remove('motion-open');
      this.drawer.hidden = true;
      return;
    }
    this.selectedFamily = family.key;
    this.title.textContent = `تیپ‌های ${family.label}`;
    this.variants.replaceChildren();
    for (const option of family.options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'presetVariant';
      button.dataset.optionId = String(option.id);
      button.textContent = option.labelRaw;
      button.setAttribute('aria-pressed', String(option.id === this.selectedOptionId));
      button.classList.toggle('selected', option.id === this.selectedOptionId);
      button.addEventListener('click', () => {
        this.selectedOptionId = option.id;
        this.setSelected(option.id);
        this.onSelect(option);
      });
      this.variants.append(button);
    }
    this.toggle.setAttribute('aria-expanded', 'true');
    this.toggle.setAttribute('aria-label', 'بستن تیپ‌ها');
    this.toggle.textContent = '▲';
    this.drawer.hidden = false;
    requestAnimationFrame(() => this.drawer.classList.add('motion-open'));
  }
}
