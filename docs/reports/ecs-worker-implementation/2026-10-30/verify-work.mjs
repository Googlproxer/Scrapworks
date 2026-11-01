// Offline integer-tick oracle. Run only after latency measurements have finished.
// Independent of Miniplex, production systems, transactions and projection code.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const [input, output] = process.argv.slice(2);
const cache = new Map();
function expected(size, workload, ticks) {
  const key = [size, workload, ticks].join('/');
  if (cache.has(key)) return cache.get(key);
  const processors = size * 0.6,
    owners = size * 0.2,
    initial = new Int32Array(processors),
    remaining = new Int32Array(processors),
    active = new Set();
  const dirty = new Int32Array(size),
    counts = [],
    bytes = [];
  for (let n = 0; n < processors; n++) {
    initial[n] = remaining[n] = 20 + ((n + 1729) % 7);
    if (workload === 'active' || n % 100 < (workload === 'idle' ? 1 : 20)) active.add(n);
  }
  let completed = 0,
    replacements = 0;
  for (let tick = 0; tick < ticks; tick++) {
    const epoch = tick + 1;
    let count = 0,
      replaced = 0;
    const mark = (n) => {
      if (dirty[n] !== epoch) {
        dirty[n] = epoch;
        count++;
      }
    };
    for (const n of active) {
      mark(n);
      if (--remaining[n] === 0) {
        completed++;
        remaining[n] = 20 + (n % 7);
      }
    }
    if (workload !== 'active') {
      const a = (Math.floor(tick / 2) % Math.floor(processors / 100)) * 100,
        b = a + (workload === 'idle' ? 1 : 20);
      if (active.has(a)) {
        active.delete(a);
        active.add(b);
      } else {
        active.add(a);
        active.delete(b);
      }
      mark(a);
      mark(b);
    }
    for (let n = processors + owners + (tick % 10); n < size; n += 10) mark(n);
    mark(processors); // Persistent player; inventory-only owners have no numeric updates.
    if (workload === 'churn') {
      const batch = size / 100;
      for (let offset = 0; offset < batch; offset++) {
        const n = (tick * batch + offset) % size;
        if (n === processors) continue;
        mark(n);
        replaced++;
        replacements++;
        if (n < processors) {
          remaining[n] = initial[n];
          if (n % 100 < 20) active.add(n);
          else active.delete(n);
        } else if (n < processors + owners) {
          // Every processor with this owner gets a changed owner reference.
          for (let processor = n - processors; processor < processors; processor += owners)
            mark(processor);
        }
      }
    }
    counts.push(count);
    bytes.push(count * 112 + replaced * 16);
  }
  const result = {
    completed,
    replacements,
    transfers: ticks * (owners / 10 - 1),
    extracted: (ticks * (size - processors - owners)) / 10,
    counts,
    bytes,
  };
  cache.set(key, result);
  return result;
}
const verified = [];
for (const file of (await fs.readdir(input)).filter((file) =>
  /^\d{4}-trial-.*\.json$/.test(file),
)) {
  const job = JSON.parse(await fs.readFile(path.join(input, file), 'utf8'));
  if (job.status !== 'ok') {
    verified.push({ file, status: job.status });
    continue;
  }
  const r = job.result,
    ticks = r.resources.tick,
    oracle = expected(job.options.size, job.options.workload, ticks);
  assert.equal(ticks, r.measuredTicks + 1, file + ': first untimed tick plus measured ticks');
  assert.equal(r.resources.counters.completed, oracle.completed, file + ': completed work');
  assert.equal(r.resources.counters.injected, oracle.completed, file + ': replenishment');
  assert.equal(r.resources.productionTotals.plate, oracle.completed, file + ': production');
  assert.equal(r.resources.counters.transfers, oracle.transfers, file + ': transfers');
  assert.equal(r.resources.counters.replacements, oracle.replacements, file + ': replacements');
  assert.equal(r.resources.extractionTotals.ore, oracle.extracted, file + ': extraction');
  assert.deepEqual(r.samples.records, oracle.counts.slice(1), file + ': every changed-row count');
  assert.deepEqual(
    r.samples.bufferBytes,
    oracle.bytes.slice(1),
    file + ': every transferred byte count',
  );
  verified.push({
    file,
    status: 'verified',
    ticks,
    completed: oracle.completed,
    transfers: oracle.transfers,
    replacements: oracle.replacements,
    changedRows: {
      min: Math.min(...oracle.counts.slice(1)),
      max: Math.max(...oracle.counts.slice(1)),
    },
  });
}
await fs.writeFile(
  output,
  JSON.stringify(
    {
      oracle:
        'Independent integer ticks, native Set membership and ordinal dirty epochs; no production imports',
      verified,
    },
    null,
    2,
  ),
);
console.log(
  `Independently verified ${verified.filter((value) => value.status === 'verified').length} trials.`,
);
