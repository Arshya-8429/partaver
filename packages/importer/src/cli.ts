import { resolve } from 'node:path';
import { backupCatalogue, verifyRestoreOnly } from './operations.js';
import { defaultDataRoot, defaultDatabasePath } from './database.js';
import { importCatalogue } from './import.js';
import { verifyCatalogue } from './verify.js';
import { publishCatalogue, rollbackCatalogue } from './publication.js';

interface CliArguments {
  positional: string[];
  values: Map<string, string>;
  flags: Set<string>;
}

function parseArguments(argv: string[]): CliArguments {
  const positional: string[] = [];
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (!value?.startsWith('--')) {
      if (value) positional.push(value);
      continue;
    }
    if (value === '--') continue;
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      values.set(value, next);
      index++;
    } else flags.add(value);
  }
  return { positional, values, flags };
}

function requiredValue(args: CliArguments, flag: string): string {
  const value = args.values.get(flag);
  if (!value) throw new Error(`Required argument is missing: ${flag}`);
  return value;
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main(): Promise<void> {
  const action = process.argv[2];
  const args = parseArguments(process.argv.slice(3));
  const dbPath = resolve(args.values.get('--db') ?? defaultDatabasePath());
  const dataRoot = resolve(args.values.get('--data-root') ?? defaultDataRoot());

  if (action === 'import') {
    const source = resolve(args.values.get('--file') ?? 'PartsFinder_Android-28 (1) (1).html');
    const report = await importCatalogue(source, { dbPath, dataRoot, dryRun: args.flags.has('--dry-run') });
    print(report);
    if (report.verification.rowHashMismatches > 0 || report.priceRoundingDifferences > 0) process.exitCode = 1;
    return;
  }

  if (action === 'verify') {
    const sourcePath = args.values.get('--file');
    const report = await verifyCatalogue(requiredValue(args, '--version'), { dbPath, ...(sourcePath ? { sourcePath } : {}) });
    print(report);
    if (!report.fullDatabaseHashMatch || report.rowHashMismatches > 0 || report.storedRowHashMismatches > 0 || report.foreignKeyViolations > 0 || report.integrityCheck !== 'ok') process.exitCode = 1;
    return;
  }

  if (action === 'backup') {
    const report = await backupCatalogue(requiredValue(args, '--output'), dbPath, dataRoot);
    print(report);
    return;
  }

  if (action === 'publish') {
    const report = await publishCatalogue(requiredValue(args, '--version'), { dbPath, dataRoot });
    print(report);
    return;
  }

  if (action === 'rollback') {
    const report = await rollbackCatalogue(requiredValue(args, '--version'), { dbPath, dataRoot });
    print(report);
    return;
  }

  if (action === 'restore') {
    if (!args.flags.has('--verify-only')) throw new Error('Restore only supports --verify-only; actual replacement requires an explicit operator checkpoint');
    const report = await verifyRestoreOnly(requiredValue(args, '--input'));
    print(report);
    if (!report.queryable) process.exitCode = 1;
    return;
  }

  throw new Error('Usage: catalogue:import -- --file PATH [--dry-run] | catalogue:verify -- --version VERSION | catalogue:publish -- --version VERSION | catalogue:rollback -- --version VERSION | catalogue:backup -- --output PATH | catalogue:restore -- --input PATH --verify-only');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
