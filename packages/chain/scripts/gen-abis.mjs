// Copies ABIs (and bytecode) from contracts/out into src/abi/*.ts as `as const` arrays.
// Run `forge build` in contracts/ first, then `pnpm --filter @sera-payroll/chain abis`.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', '..', '..', 'contracts', 'out');
const dest = join(here, '..', 'src', 'abi');
mkdirSync(dest, { recursive: true });
for (const name of ['PayrollDisburser', 'PayslipRegistry', 'TestStablecoin']) {
  const art = JSON.parse(readFileSync(join(out, `${name}.sol`, `${name}.json`), 'utf8'));
  const body = `// Generated from contracts/out/${name}.sol/${name}.json by scripts/gen-abis.mjs. Do not edit.\n` +
    `export const ${name}Abi = ${JSON.stringify(art.abi, null, 2)} as const;\n` +
    `export const ${name}Bytecode = ${JSON.stringify(art.bytecode.object)} as const;\n`;
  writeFileSync(join(dest, `${name}.ts`), body);
  console.log('wrote', name, art.abi.length, 'entries');
}
