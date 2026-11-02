import fastifyStatic from '@fastify/static';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';

export async function registerWeb(server: FastifyInstance, webRoot: string): Promise<void> {
  const root = resolve(webRoot);
  if (!(await stat(resolve(root, 'index.html'))).isFile()) throw new Error('Build the web application before starting the release runtime.');
  // Explicit routes keep source files, SQLite, unknown SPA paths and build metadata unservable.
  await server.register(fastifyStatic, { root, serve: false, dotfiles: 'deny' });
  for (const path of ['/', '/product', '/features', '/offline-data', '/support', '/contact', '/app', '/app/', '/app/*']) {
    server.get(path, async (_request, reply) => reply.header('cache-control', 'private, no-cache').sendFile('index.html', { cacheControl: false }));
  }
  server.get('/assets/:asset', async (request, reply) => {
    const name = (request.params as { asset: string }).asset;
    if (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.(?:js|css|woff2?|svg|png|webp|ico)$/.test(name)) return reply.callNotFound();
    return reply.header('cache-control', 'public, max-age=31536000, immutable').sendFile(`assets/${name}`, { cacheControl: false });
  });
  server.get('/website/:asset', async (request, reply) => {
    const name = (request.params as { asset: string }).asset;
    if (!/^[A-Za-z0-9_-]+\.(?:webp|svg|png)$/.test(name)) return reply.callNotFound();
    return reply.header('cache-control', 'public, max-age=3600').sendFile(`website/${name}`, { cacheControl: false });
  });
  for (const name of ['sw.js', 'manifest.webmanifest', 'favicon.svg', 'robots.txt']) {
    server.get(`/${name}`, async (_request, reply) => {
      if (name === 'sw.js') reply.header('service-worker-allowed', '/');
      return reply.header('cache-control', 'private, no-cache').sendFile(name, { cacheControl: false });
    });
  }
  for (const size of [192, 512]) {
    server.get(`/icons/icon-${size}.png`, async (_request, reply) => reply.header('cache-control', 'public, max-age=3600').sendFile(`icons/icon-${size}.png`, { cacheControl: false }));
  }
}
