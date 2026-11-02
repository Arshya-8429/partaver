import { runPriceHistoryCli } from '../packages/importer/src/price-history/cli.js';
runPriceHistoryCli(process.argv.slice(2)).then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n')).catch((error:unknown)=>{process.stderr.write((error instanceof Error?error.message:String(error))+'\n');process.exitCode=1;});
