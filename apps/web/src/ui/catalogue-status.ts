import type { CatalogueManifest } from '@partsfinder/contracts';
import type { Catalogue } from '../catalogue.js';
import type { CatalogueWorkerClient } from '../offline/worker-client.js';
import type { InstallProgress } from '../offline/installer.js';
import { estimateInstallStorageBytes } from '../offline/storage-budget.js';
import { readJson } from '../catalogue.js';
import { requiredElement } from './dom.js';
interface LocalRecord {
  activeVersion: string | null; ready: boolean; state: string; rowCount?: number;
  importedAt?: string | null; priceEffectiveAt?: string | null; currencyUnit?: string;
}
export class CatalogueStatusController {
  private readonly text = requiredElement('catalogueStatusText');
  private readonly meta = requiredElement('catalogueStatusMeta');
  private readonly version = requiredElement('catalogueVersion');
  private readonly progress = requiredElement<HTMLProgressElement>('catalogueProgress');
  private readonly update = requiredElement<HTMLButtonElement>('catalogueUpdateButton');
  private readonly cancel = requiredElement<HTMLButtonElement>('catalogueCancelButton');
  private readonly info = requiredElement<HTMLDetailsElement>('catalogueInfo');
  private local: LocalRecord | null = null;
  private remote: CatalogueManifest | null = null;
  private controller: AbortController | null = null;
  private shellReady = false;
  private checking = false;
  private destroyed = false;
  private notice = '';
  private size: number | null = null;
  private channel: BroadcastChannel | null = null;
  private localRefresh: Promise<void> | null = null;
  private refreshRequested = false;
  constructor(private readonly worker: CatalogueWorkerClient, private readonly catalogue: Catalogue, private readonly onVersion: (version: string | null) => Promise<void> | void, shell: Promise<boolean>) {
    this.update.addEventListener('click', () => void this.install());
    this.cancel.addEventListener('click', () => this.controller?.abort());
    window.addEventListener('online', this.connectivity); window.addEventListener('offline', this.connectivity);
    window.addEventListener('focus', this.refreshLocal);
    document.addEventListener('visibilitychange', this.visible);
    try {
      this.channel = new BroadcastChannel('partsfinder-catalogue');
      this.channel.addEventListener('message', event => { if (event.data?.type === 'activated') this.refreshLocal(); });
    } catch { /* Focus/visibility recheck IndexedDB when notifications are unavailable. */ }
    this.info.addEventListener('toggle', () => { if (this.info.open) void this.loadSize(); });
    void shell.then(ready => { this.shellReady = ready; if (!this.controller && this.local) this.render(); });
  }
  async initialize(): Promise<void> {
    this.connection();
    try { this.local = await this.worker.status(); }
    catch { this.local = { activeVersion: null, ready: false, state: 'failed' }; this.notice = 'ذخیرهٔ مرورگر قابل خواندن نیست؛ جست‌وجوی آنلاین را امتحان کنید.'; }
    this.catalogue.setLocalVersion(this.local.ready ? this.local.activeVersion : null);
    this.render();
    // Local search is activated before any network metadata request.
    await this.onVersion(this.local.ready ? this.local.activeVersion : null);
    if (navigator.onLine) await this.check();
  }
  destroy(): void { this.destroyed = true; this.controller?.abort(); this.channel?.close(); window.removeEventListener('online', this.connectivity); window.removeEventListener('offline', this.connectivity); window.removeEventListener('focus', this.refreshLocal); document.removeEventListener('visibilitychange', this.visible); }
  private readonly refreshLocal = (): void => { void this.refreshLocalState(); };
  private readonly visible = (): void => { if (document.visibilityState === 'visible') this.refreshLocal(); };
  private refreshLocalState(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    this.refreshRequested = true;
    if (this.localRefresh) return this.localRefresh;
    this.localRefresh = (async () => {
      while (this.refreshRequested && !this.destroyed) {
        this.refreshRequested = false;
        try {
          // A notification is only a hint; the Worker reads the authoritative atomic pointer.
          const local = await this.worker.status();
          if (this.destroyed) return;
          const previous = this.local?.ready ? this.local.activeVersion : null;
          const current = local.ready ? local.activeVersion : null;
          this.local = local;
          this.catalogue.setLocalVersion(current);
          if (current !== previous) {
            this.notice = 'کاتالوگ محلی تغییر کرد؛ جست‌وجو را دوباره اجرا کنید.';
            await this.onVersion(current ?? (navigator.onLine ? this.remote?.catalogVersion ?? null : null));
          }
          if (!this.controller) this.render();
        } catch { /* A lifecycle refresh must preserve the last usable state on storage failure. */ }
      }
    })().finally(() => { this.localRefresh = null; });
    return this.localRefresh;
  }
  private readonly connectivity = (): void => {
    this.connection();
    if (this.controller) return;
    this.render(); if (navigator.onLine) void this.check();
  };
  private connection(): void {
    const target = requiredElement('connectionStatus'); target.textContent = navigator.onLine ? 'متصل' : 'بدون اتصال'; target.dataset.online = String(navigator.onLine);
  }
  private async check(): Promise<void> {
    if (this.checking || this.destroyed || !navigator.onLine) return;
    this.checking = true;
    try {
      const remote = await this.catalogue.manifest(); if (this.destroyed) return;
      if (this.remote?.catalogVersion !== remote.catalogVersion) this.size = null;
      this.remote = remote;
      if (!this.local?.ready) await this.onVersion(remote.catalogVersion);
      if (!this.controller) this.render();
      if (this.info.open) void this.loadSize();
    } catch { if (!this.controller) { this.notice = this.local?.ready ? 'بررسی نسخهٔ جدید انجام نشد؛ دادهٔ محلی همچنان قابل استفاده است.' : 'سرویس کاتالوگ در دسترس نیست؛ اتصال یا اجرای سرویس را بررسی کنید.'; this.render(); } }
    finally { this.checking = false; }
  }
  private async loadSize(): Promise<void> {
    if (!navigator.onLine || !this.remote || this.size !== null || this.controller) return;
    const version = this.remote.catalogVersion;
    try {
      const snapshot = await readJson<{ totalDecodedBytes: number }>(`catalog/${version}/snapshot/manifest`, {}, AbortSignal.timeout(8000));
      if (this.remote?.catalogVersion !== version) return;
      this.size = snapshot.totalDecodedBytes;
      if (!this.controller) this.render();
    } catch { /* Snapshot size is optional; installer still validates its own manifest. */ }
  }
  private async install(): Promise<void> {
    if (this.controller || this.destroyed) return;
    if (!navigator.onLine) { this.notice = 'برای دریافت یا بررسی نسخه به اینترنت وصل شوید.'; this.render(); return; }
    this.controller = new AbortController(); const controller = this.controller;
    this.update.disabled = true; this.cancel.hidden = false; this.info.open = true; this.notice = '';
    this.text.textContent = 'در حال بررسی نسخهٔ کاتالوگ…'; this.text.dataset.state = 'checking';
    this.progress.hidden = false; this.progress.removeAttribute('value');
    try {
      const result = await this.worker.install(progress => this.renderProgress(progress), controller.signal);
      this.local = await this.worker.status();
      this.catalogue.setLocalVersion(this.local.ready ? this.local.activeVersion : null);
      await this.onVersion(this.local.ready ? this.local.activeVersion : this.remote?.catalogVersion ?? null);
      this.notice = result.unchanged ? 'کاتالوگ محلی به‌روز است.' : 'کاتالوگ آفلاین با موفقیت نصب شد.';
      if (result.persistentStorageGranted === false) this.notice += ' مرورگر ماندگاری ذخیره را تضمین نکرده است.';
    } catch (error) {
      const cancelled = controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError');
      try { this.local = await this.worker.status(); } catch { /* Preserve previous valid state. */ }
      this.catalogue.setLocalVersion(this.local?.ready ? this.local.activeVersion : null);
      await this.onVersion(this.local?.ready ? this.local.activeVersion : this.remote?.catalogVersion ?? null);
      this.notice = cancelled ? this.local?.ready ? 'به‌روزرسانی لغو شد؛ نسخهٔ قبلی همچنان آماده است.' : 'دریافت لغو شد؛ می‌توانید آن را ادامه دهید.' : installationError(error);
      if (!cancelled && this.local?.ready) this.notice += ' نسخهٔ قبلی همچنان قابل جست‌وجو است.';
    } finally {
      this.controller = null; this.progress.hidden = true; this.cancel.hidden = true; this.update.disabled = false;
      if (!this.destroyed) this.render();
    }
  }
  private renderProgress(progress: InstallProgress): void {
    const labels = { empty: 'آماده‌سازی دریافت…', downloading: 'در حال دریافت کاتالوگ…', importing: 'در حال ذخیرهٔ داده‌ها…', indexing: 'در حال ساخت نمایهٔ جست‌وجو…', validating: 'در حال بررسی صحت داده‌ها…', ready: 'در حال فعال‌سازی کاتالوگ…', failed: 'دریافت کامل نشد' };
    this.text.textContent = labels[progress.state]; this.text.dataset.state = progress.state;
    this.info.querySelector('summary')?.setAttribute('aria-label', `${labels[progress.state]}، اطلاعات و دریافت`);
    this.progress.hidden = false;
    if (progress.state === 'downloading' && progress.totalBytes > 0) this.progress.value = Math.min(100, progress.downloadedBytes / progress.totalBytes * 100);
    else this.progress.removeAttribute('value');
    this.meta.textContent = progress.totalChunks ? `${progress.completedChunks.toLocaleString('fa-IR')} از ${progress.totalChunks.toLocaleString('fa-IR')} بخش بررسی شده · ${bytes(progress.downloadedBytes)} از ${bytes(progress.totalBytes)}\n${this.local?.ready ? 'نسخهٔ قبلی در همین حین قابل جست‌وجو است.' : 'دریافت را می‌توانید لغو و بعداً ادامه دهید.'}` : 'بررسی اطلاعات نسخه…';
  }
  private render(): void {
    const ready = this.local?.ready && this.local.activeVersion;
    const online = navigator.onLine && this.remote;
    const updateAvailable = ready && this.remote && this.remote.catalogVersion !== this.local?.activeVersion;
    this.text.dataset.state = ready ? 'ready' : online ? 'online' : 'empty';
    this.text.textContent = ready
      ? this.shellReady ? updateAvailable ? 'آفلاین آماده است · نسخهٔ جدید موجود است' : 'آمادهٔ جست‌وجوی آفلاین' : 'کاتالوگ محلی آماده است · پوستهٔ آفلاین تأیید نشده'
      : online ? 'جست‌وجوی آنلاین آماده است · دریافت آفلاین اختیاری' : 'کاتالوگ آفلاین نصب نشده است';
    this.text.dataset.offlineReady = String(Boolean(ready && this.shellReady));
    this.info.querySelector('summary')?.setAttribute('aria-label', `${this.text.textContent}، اطلاعات و دریافت`);
    const record = ready ? this.local! : this.remote;
    const version = ready ? this.local!.activeVersion : this.remote?.catalogVersion;
    this.version.textContent = version ? `نسخه ${version}` : '';
    requiredElement('dbCount').textContent = record?.rowCount?.toLocaleString('fa-IR') ?? '—';
    const lines = [];
    if (this.notice) lines.push(this.notice);
    if (ready) lines.push(this.shellReady ? 'پوستهٔ برنامه و کاتالوگ محلی بررسی شده‌اند.' : 'دادهٔ محلی آماده است؛ اجرای کامل بدون اتصال هنوز تأیید نشده است.');
    else lines.push(navigator.onLine ? 'جست‌وجوی آنلاین فقط صفحهٔ موردنیاز را دریافت می‌کند. برای استفادهٔ بدون اتصال، کاتالوگ را دریافت کنید.' : 'برای نخستین استفاده و دریافت داده به اینترنت وصل شوید.');
    if (this.local?.importedAt) lines.push(`زمان نصب محلی: ${date(this.local.importedAt)}`);
    lines.push(record?.priceEffectiveAt ? `تاریخ مؤثر قیمت: ${date(record.priceEffectiveAt)}` : 'تاریخ مؤثر قیمت در منبع اعلام نشده است.');
    if (this.size !== null) lines.push(`حجم دادهٔ دریافت: ${bytes(this.size)} · برآورد فضای لازم: حدود ${bytes(estimateInstallStorageBytes(this.size))} (مصرف واقعی مرورگر متغیر است).`);
    this.meta.textContent = lines.join('\n');
    this.update.textContent = ready ? updateAvailable ? 'دریافت نسخهٔ جدید' : 'بررسی به‌روزرسانی' : 'دریافت برای استفادهٔ آفلاین';
    this.update.disabled = !navigator.onLine;
    if (!navigator.onLine && !ready) this.info.open = true;
  }
}
function bytes(value: number): string { return `${new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 }).format(value / 1024 / 1024)} مگابایت`; }
function date(value: string): string { const result = new Date(value); return Number.isNaN(result.getTime()) ? value : new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(result); }
function installationError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/quota|storage|space/i.test(message)) return 'فضای کافی در ذخیرهٔ مرورگر در دسترس نیست؛ فضا آزاد کنید و دوباره تلاش کنید.';
  if (/another|lease/i.test(message)) return 'دریافت در پنجرهٔ دیگری فعال است؛ پس از پایان آن دوباره تلاش کنید.';
  if (/hash|checksum|malformed|validation|corrupt/i.test(message)) return 'صحت دادهٔ دریافتی تأیید نشد؛ دوباره تلاش کنید.';
  return 'دریافت کامل نشد؛ اتصال را بررسی و دوباره تلاش کنید. بخش‌های معتبر ذخیره‌شده دوباره استفاده می‌شوند.';
}
