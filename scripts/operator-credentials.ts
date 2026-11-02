import { randomBytes, createHash } from 'node:crypto';
import { open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { validateAccessConfiguration } from '../apps/api/src/access.js';

async function main(): Promise<void> {
  const { values } = parseArgs({ args: process.argv.slice(2).filter(value => value !== '--'), options: {
    output: { type: 'string' }, origin: { type: 'string' }, username: { type: 'string', default: 'operator' },
  }, strict: true });
  if (!values.output || !values.origin) throw new Error('Usage: release:credentials --output /private/operator.env --origin https://your-host --username operator');
  const token = randomBytes(32).toString('base64url');
  const config = validateAccessConfiguration({ publicOrigin: values.origin, username: values.username!, tokenSha256: createHash('sha256').update(token).digest('hex') });
  const output = resolve(values.output);
  const loginPath = `${output}.login.json`;
  const created: string[] = [];
  try {
    const envFile = await open(output, 'wx', 0o600); created.push(output);
    try {
      const loginFile = await open(loginPath, 'wx', 0o600); created.push(loginPath);
      try {
        await loginFile.writeFile(`${JSON.stringify({ origin: config.publicOrigin, username: config.username, password: token, purpose: 'Use the generated token as the browser Basic authentication password. Keep this file private; do not include it in releases.' }, null, 2)}\n`);
        await loginFile.sync();
      } finally { await loginFile.close(); }
      await envFile.writeFile(`NODE_ENV=production\nHOST=127.0.0.1\nPORT=8787\nPARTAVAR_PUBLIC_ORIGIN=${config.publicOrigin}\nPARTAVAR_AUTH_USERNAME=${config.username}\nPARTAVAR_AUTH_TOKEN_SHA256=${config.tokenSha256}\n`);
      await envFile.sync();
    } finally { await envFile.close(); }
  } catch (error) {
    for (const path of created) await unlink(path);
    throw error;
  }
  process.stdout.write(`${JSON.stringify({ environmentFile: output, privateLoginFile: loginPath, message: 'Credentials generated. Store the login file in the operator password manager; load the environment file only on the server.' })}\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : 'Credential generation failed.'}\n`); process.exitCode = 1; });
}
