import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

export interface AccessConfiguration {
  publicOrigin: string;
  username: string;
  tokenSha256: string;
}

export function validateAccessConfiguration(config: AccessConfiguration): AccessConfiguration {
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(config.username) || !/^[a-f0-9]{64}$/.test(config.tokenSha256)) {
    throw new Error('Production authentication requires an operator username and generated token SHA-256.');
  }
  const origin = new URL(config.publicOrigin);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
      (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && local))) {
    throw new Error('PARTAVAR_PUBLIC_ORIGIN must be an HTTPS origin (HTTP is allowed only for loopback verification).');
  }
  return { ...config, publicOrigin: origin.origin };
}

export function accessFromEnvironment(env: NodeJS.ProcessEnv): AccessConfiguration | undefined {
  if (env.NODE_ENV !== 'production') return undefined;
  return validateAccessConfiguration({
    publicOrigin: env.PARTAVAR_PUBLIC_ORIGIN ?? '',
    username: env.PARTAVAR_AUTH_USERNAME ?? '',
    tokenSha256: env.PARTAVAR_AUTH_TOKEN_SHA256 ?? '',
  });
}

function privatePath(path: string): boolean {
  return /^\/(?:app|api)(?:\/|$)/.test(path) || ['/health/ready', '/sw.js', '/manifest.webmanifest'].includes(path);
}

const policy = [
  "default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "font-src 'self'", "connect-src 'self'", "worker-src 'self'", "manifest-src 'self'", "frame-src 'self'",
  "base-uri 'none'", "object-src 'none'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');

export function registerAccess(server: FastifyInstance, config?: AccessConfiguration): void {
  const normalized = config ? validateAccessConfiguration(config) : undefined;
  const expectedHost = normalized ? new URL(normalized.publicOrigin).host : undefined;
  const expectedToken = normalized ? Buffer.from(normalized.tokenSha256, 'hex') : undefined;
  server.addHook('onRequest', async (request, reply) => {
    reply.header('x-content-type-options', 'nosniff')
      .header('referrer-policy', 'no-referrer')
      .header('x-frame-options', 'DENY')
      .header('cross-origin-resource-policy', 'same-origin')
      .header('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    // Vite development uses its own server; this CSP governs the built production shell.
    if (normalized) reply.header('content-security-policy', policy);
    if (!normalized) return;

    const rawPath = (request.raw.url ?? '/').split('?')[0] ?? '/';
    let path: string;
    try { path = decodeURIComponent(rawPath); } catch {
      return reply.code(400).header('cache-control', 'no-store').send({ error: { code: 'INVALID_PATH', message: 'Invalid request path.' } });
    }
    if (path.includes('\\') || path.split('/').some(segment => segment === '.' || segment === '..')) {
      return reply.code(400).header('cache-control', 'no-store').send({ error: { code: 'INVALID_PATH', message: 'Invalid request path.' } });
    }
    if (path !== '/health/live' && request.headers.host?.toLowerCase() !== expectedHost?.toLowerCase()) {
      return reply.code(403).header('cache-control', 'no-store').send({ error: { code: 'ORIGIN_REJECTED', message: 'Request origin is not allowed.' } });
    }
    if (!privatePath(path)) return;
    const origin = request.headers.origin;
    if ((origin !== undefined && origin !== normalized.publicOrigin) || request.headers['sec-fetch-site'] === 'cross-site') {
      return reply.code(403).header('cache-control', 'no-store').send({ error: { code: 'ORIGIN_REJECTED', message: 'Request origin is not allowed.' } });
    }
    const authorization = request.headers.authorization;
    let valid = false;
    if (authorization && authorization.length <= 1024 && /^Basic [A-Za-z0-9+/]+={0,2}$/i.test(authorization)) {
      try {
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(authorization.slice(6), 'base64'));
        const separator = decoded.indexOf(':');
        const username = decoded.slice(0, separator);
        const password = decoded.slice(separator + 1);
        const supplied = createHash('sha256').update(password).digest();
        valid = separator >= 0 && timingSafeEqual(supplied, expectedToken!) && username === normalized.username;
      } catch { /* Malformed credentials receive the same response as a wrong token. */ }
    }
    if (!valid) {
      return reply.code(401).header('www-authenticate', 'Basic realm="PartAvar", charset="UTF-8"')
        .header('cache-control', 'no-store').send({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Operator authentication is required.' } });
    }
    reply.header('cache-control', 'private, no-store').header('vary', 'Authorization');
  });
}
