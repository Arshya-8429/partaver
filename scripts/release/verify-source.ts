import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { verifyCatalogue } from '../../packages/importer/src/verify.js';

// The importer resolves migration files against cwd. This child process isolates
// that legacy assumption and only opens the verifier's disposable database copy.
const { values } = parseArgs({ options: { root: { type: 'string' }, db: { type: 'string' }, file: { type: 'string' }, version: { type: 'string' } } });
if (!values.root || !values.db || !values.file || !values.version) throw new Error('Missing source verification arguments');
process.chdir(resolve(values.root));
const result = await verifyCatalogue(values.version, { dbPath: resolve(values.db), sourcePath: resolve(values.file) });
if (!result.sourceShaMatches || !result.fullDatabaseHashMatch || !result.fullRowsHashMatch || !result.metadataHashMatch ||
    Object.values(result.fieldHashMatches).some(value => !value) || result.rowHashMismatches || result.storedRowHashMismatches ||
    result.foreignKeyViolations || result.integrityCheck !== 'ok' || result.priceRoundingDifferences) throw new Error(`Release source roundtrip failed: ${JSON.stringify(result)}`);
process.stdout.write(`${JSON.stringify(result)}\n`);
