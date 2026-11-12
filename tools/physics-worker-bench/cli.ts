import fs from 'node:fs/promises';
import path from 'node:path';
import { prepare, reportRoot } from './prepare.ts';
import { requireLocal } from './protocol.ts';
import { runProbes } from './probes.ts';
import { VARIANTS, type Variant } from './protocol.ts';

requireLocal();
const command = process.argv[2] ?? '--help';
if (command === '--help') {
  console.log(
    'Local only: node tools/physics-worker-bench/cli.ts prepare | status | probes --start-authorized [--variant B0|B1|C1] [--browser chromium|firefox] [--device keyboard|synthetic-gamepad] [--runs 5] [--cycles 200] [--headless]\nprepare builds isolated optimized B0/B1/C1 projects; it does not launch a browser or run the experiment. probes is one diagnostic acquisition command, not the full qualification suite.',
  );
} else if (command === 'prepare') {
  console.log(JSON.stringify(await prepare(), null, 2));
} else if (command === 'status') {
  for (const name of ['preparation.json', 'stages.json']) {
    try {
      console.log(await fs.readFile(path.join(reportRoot, name), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') console.log(`${name}: not prepared`);
      else throw error;
    }
  }
} else if (command === 'probes') {
  const args = process.argv.slice(3);
  const value = (name: string, fallback: string) => {
    const at = args.indexOf(name);
    if (at < 0) return fallback;
    if (!args[at + 1] || args[at + 1].startsWith('--')) throw new Error(`Missing ${name} value`);
    return args[at + 1];
  };
  const variant = value('--variant', 'B0');
  const browser = value('--browser', 'chromium');
  const device = value('--device', 'keyboard');
  if (
    !VARIANTS.includes(variant as Variant) ||
    !['chromium', 'firefox'].includes(browser) ||
    !['keyboard', 'synthetic-gamepad'].includes(device)
  )
    throw new Error('Unknown variant, browser or input device');
  console.log(
    await runProbes({
      authorized: args.includes('--start-authorized'),
      variant: variant as Variant,
      browser: browser as 'chromium' | 'firefox',
      device: device as 'keyboard' | 'synthetic-gamepad',
      runs: Number(value('--runs', '5')),
      cycles: Number(value('--cycles', '200')),
      headed: !args.includes('--headless'),
      seed: Number(value('--seed', '20261110')),
      holdMs: Number(value('--hold-ms', '600')),
    }),
  );
} else {
  throw new Error(`Unknown or unimplemented command: ${command}. No experiment run was started.`);
}
