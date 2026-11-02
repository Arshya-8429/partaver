import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';

const temporary: string[] = [];
afterEach(async () => { for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true }); });
function run(args: string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/operator-credentials.ts'), ...args], { encoding: 'utf8' });
}

it('generates a random operator token into private files, configures only its verifier, and never prints the token', async () => {
  const root = await mkdtemp(join(tmpdir(), 'partavar-auth-test-')); temporary.push(root);
  const output = join(root, 'operator.env');
  const result = run(['--output', output, '--origin', 'https://parts.example.test', '--username', 'operator']);
  expect(result.status, result.stderr).toBe(0);
  const env = await readFile(output, 'utf8');
  const login = JSON.parse(await readFile(`${output}.login.json`, 'utf8')) as { username: string; password: string; origin: string };
  expect(login.username).toBe('operator');
  expect(login.origin).toBe('https://parts.example.test');
  expect(login.password).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(env).toContain(`PARTAVAR_AUTH_TOKEN_SHA256=${createHash('sha256').update(login.password).digest('hex')}`);
  expect(env).not.toContain(login.password);
  expect(result.stdout + result.stderr).not.toContain(login.password);
  expect((await stat(output)).mode & 0o777).toBe(0o600);
  expect((await stat(`${output}.login.json`)).mode & 0o777).toBe(0o600);
  const repeated = run(['--output', output, '--origin', 'https://parts.example.test']);
  expect(repeated.status).not.toBe(0);
  expect(await readFile(output, 'utf8')).toBe(env);
});

it('rejects external HTTP and credential injection before writing either file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'partavar-auth-test-')); temporary.push(root);
  for (const [origin, username] of [['http://parts.example.test', 'operator'], ['https://parts.example.test/path', 'operator'], ['https://parts.example.test', 'bad\nENV=value']]) {
    const output = join(root, 'rejected.env');
    const result = run(['--output', output, '--origin', origin!, '--username', username!]);
    expect(result.status).not.toBe(0);
    await expect(stat(output)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(`${output}.login.json`)).rejects.toMatchObject({ code: 'ENOENT' });
  }
});
