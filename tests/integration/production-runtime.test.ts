import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer } from '../../apps/api/src/server.js';
import { importCatalogue } from '../../packages/importer/src/import.js';
import { publishCatalogue } from '../../packages/importer/src/publication.js';

let root = '';
let version = '';
let server: Awaited<ReturnType<typeof createServer>>;
const token = 'test-only-256-bit-token-not-a-production-credential';
const auth = `Basic ${Buffer.from(`operator:${token}`).toString('base64')}`;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'partavar-production-'));
  const source = join(root, 'source.html');
  await writeFile(source, `<script>const DB=${JSON.stringify({ rows: [{ part: 'Brake', tech: '001-01', log: '000LOG-01', models: ['Model A'], price: 1000, aliases: [], friendly: [], replacement: '' }], parts: ['Brake'], primary: [], others: [], groups: {}, primaryOptions: [{ label: 'Model A', models: ['Model A'] }] })};</script>`);
  const dbPath = join(root, 'catalogue.db');
  version = (await importCatalogue(source, { dbPath, dataRoot: root })).versionId;
  await publishCatalogue(version, { dbPath, dataRoot: root });
  const webRoot = join(root, 'web');
  await mkdir(join(webRoot, 'assets'), { recursive: true });
  await mkdir(join(webRoot, '.vite'));
  await writeFile(join(webRoot, 'index.html'), '<!doctype html><html lang="fa"><title>PartAvar fixture</title><script type="module" src="/assets/app-deadbeef.js"></script></html>');
  await writeFile(join(webRoot, 'assets/app-deadbeef.js'), 'console.log("public shell only");');
  await writeFile(join(webRoot, 'sw.js'), '/* fixture service worker */');
  await writeFile(join(webRoot, 'manifest.webmanifest'), '{"name":"PartAvar"}');
  await writeFile(join(webRoot, 'robots.txt'), 'User-agent: *\nDisallow: /app\nDisallow: /api/\nAllow: /\n');
  await writeFile(join(webRoot, '.vite/manifest.json'), '{"privateBuildMetadata":true}');
  const options = { databasePath: dbPath, dataRoot: root, webRoot, logger: false, access: {
    publicOrigin: 'https://parts.example.test', username: 'operator', tokenSha256: createHash('sha256').update(token).digest('hex'),
  } };
  server = await createServer(options);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  if (server) await server.close();
  if (root) await rm(root, { recursive: true, force: true });
});

const inject = (url: string, extra: Record<string, string> = {}, authorized = true) => server.inject({ url, headers: { host: 'parts.example.test', ...(authorized ? { authorization: auth } : {}), ...extra } });

describe('private production runtime', () => {
  it('serves the public website and hashed assets from the built root', async () => {
    for (const path of ['/', '/product', '/features', '/offline-data', '/support', '/contact']) {
      const response = await inject(path, {}, false);
      expect(response.statusCode, path).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.body).toContain('PartAvar fixture');
      expect(response.headers['cache-control']).toContain('no-cache');
    }
    const script = await inject('/assets/app-deadbeef.js', {}, false);
    expect(script.statusCode).toBe(200);
    expect(script.headers['content-type']).toContain('javascript');
    expect(script.headers['cache-control']).toContain('immutable');
    expect((await inject('/health/live', {}, false)).json()).toEqual({ status: 'live' });
    const robots = await inject('/robots.txt', {}, false);
    expect(robots.statusCode).toBe(200);
    expect(robots.headers['content-type']).toContain('text/plain');
    expect(robots.body).toContain('Disallow: /app');
  });

  it('requires authentication on app, all API routes, manifests and snapshot bytes', async () => {
    const manifest = (await inject(`/api/v1/catalog/${version}/snapshot/manifest`)).json();
    for (const path of ['/app', '/app/', '/app/documents', '/api/v1/catalog/manifest', '/api/v1/search?q=001-01', '/api/v1/openapi.json', '/api/unknown', '/health/ready', '/sw.js', '/manifest.webmanifest', `/api/v1/catalog/${version}/snapshot/manifest`, manifest.chunks[0].path as string]) {
      const response = await inject(path, {}, false);
      expect(response.statusCode, path).toBe(401);
      expect(response.headers['www-authenticate'], path).toContain('Basic');
      expect(response.headers['cache-control'], path).toBe('no-store');
      expect(response.body).not.toContain('000LOG-01');
    }
    expect((await inject('/app/', { authorization: `Basic ${Buffer.from('operator:wrong').toString('base64')}` })).statusCode).toBe(401);
    expect((await inject('/app/', { authorization: 'Basic !!!' })).statusCode).toBe(401);
    expect((await inject('/app/')).statusCode).toBe(200);
  });

  it('keeps authenticated indexed search, immutable snapshots and revalidation working', async () => {
    const search = await inject(`/api/v1/search?version=${version}&mode=global&kind=code&q=001-01&limit=1`);
    expect(search.statusCode).toBe(200);
    expect(search.json()).toMatchObject({ items: [{ techRaw: '001-01', logRaw: '000LOG-01', basePrice: '1000', middlePrice: '1100', finalPrice: '1200' }] });
    const manifest = await inject(`/api/v1/catalog/${version}/snapshot/manifest`);
    const chunk = await inject(manifest.json().chunks[0].path as string);
    expect(chunk.statusCode).toBe(200);
    expect(chunk.headers['cache-control']).toContain('private');
    expect(createHash('sha256').update(chunk.rawPayload).digest('hex')).toBe(manifest.json().chunks[0].sha256);
    expect((await inject(`/api/v1/catalog/${version}/snapshot/manifest`, { 'if-none-match': String(manifest.headers.etag) })).statusCode).toBe(304);
    expect((await inject(`/api/v1/catalog/${version}/snapshot/manifest`, { 'if-none-match': String(manifest.headers.etag) }, false)).statusCode).toBe(401);
  });

  it('rejects foreign Host, Origin and cross-site private reads even with credentials', async () => {
    for (const headers of [{ host: 'attacker.invalid' }, { origin: 'https://attacker.invalid' }, { 'sec-fetch-site': 'cross-site' }]) {
      const response = await inject('/api/v1/catalog/manifest', headers);
      expect(response.statusCode).toBe(403);
      expect(response.body).not.toContain(version);
    }
    expect((await inject('/api/v1/catalog/manifest', { origin: 'https://parts.example.test' })).statusCode).toBe(200);
  });

  it('never serves sources, databases, build metadata or an SPA response for missing APIs', async () => {
    for (const path of ['/private-data/sqlite/catalogue.db', '/.env', '/.vite/manifest.json', '/src/server.ts', '/PartsFinder_Android-28%20(1)%20(1).html', '/unknown', '/api/v1/missing', '/assets/missing.js']) {
      const response = await inject(path);
      expect(response.statusCode, path).toBe(404);
      expect(response.body, path).not.toContain('PartAvar fixture');
    }
    expect((await inject('/%2e%2e/private-data/sqlite/catalogue.db')).statusCode).not.toBe(200);
  });

  it('sends browser protections and revalidates shell/SW instead of caching a login', async () => {
    const response = await inject('/app/');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['content-security-policy']).toContain("worker-src 'self'");
    expect(response.headers['cross-origin-resource-policy']).toBe('same-origin');
    const sw = await inject('/sw.js');
    expect(sw.statusCode).toBe(200);
    expect(sw.headers['cache-control']).toContain('no-cache');
    expect(sw.headers['service-worker-allowed']).toBe('/');
  });

  it('fails closed when production environment has no authentication configuration', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PARTAVAR_AUTH_USERNAME', '');
    vi.stubEnv('PARTAVAR_AUTH_TOKEN_SHA256', '');
    vi.stubEnv('PARTAVAR_PUBLIC_ORIGIN', 'https://parts.example.test');
    let accidental: Awaited<ReturnType<typeof createServer>> | undefined;
    let error: unknown;
    try { accidental = await createServer({ databasePath: join(root, 'catalogue.db'), logger: false }); } catch (cause) { error = cause; }
    finally { await accidental?.close(); vi.unstubAllEnvs(); }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/auth|credential/i);
  });
});
