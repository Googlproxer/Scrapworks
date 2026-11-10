export interface CellInfluence {
  id: string;
  cell: number;
  positive: number;
  negative: number;
}

/** One saved simulation-second of work; fair capped allocation never mints overflow. */
export function restoreCells(
  health: number[],
  columns: number,
  influences: readonly CellInfluence[],
): void {
  const active = influences.filter((source) => source.positive > 0 || source.negative > 0);
  if (!active.length) return;

  const distance = (a: number, b: number) =>
    Math.abs((a % columns) - (b % columns)) +
    Math.abs(Math.floor(a / columns) - Math.floor(b / columns));

  const negative = health.map(() => 0);
  const ordered = active.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const contributors = ordered
    .filter((source) => source.positive > 0)
    .map((s) => ({ ...s, remaining: s.positive }));
  for (const source of ordered) {
    if (!source.negative) continue;
    const cells = health.map((_, i) => i).filter((i) => distance(i, source.cell) <= 3);
    for (const cell of cells) negative[cell] += source.negative / cells.length;
  }
  const needs = health.map((h, i) => 100 - h + negative[i]);
  const added = health.map(() => 0);
  const maximum = columns + Math.ceil(health.length / columns);
  for (let radius = 0; radius <= maximum; radius++) {
    if (!contributors.some((source) => source.remaining > 1e-9)) break;
    for (let round = 0; round <= health.length; round++) {
      if (!contributors.some((source) => source.remaining > 1e-9)) break;
      const candidates = contributors.map((s) =>
        health.map((_, i) => i).filter((i) => needs[i] > 1e-9 && distance(i, s.cell) === radius),
      );
      const offers = contributors.map((s, i) =>
        candidates[i].length ? s.remaining / candidates[i].length : 0,
      );
      if (!offers.some((n) => n > 1e-9)) break;
      for (let cell = 0; cell < health.length; cell++) {
        let donors = contributors
          .map((_, i) => i)
          .filter((i) => offers[i] > 1e-9 && candidates[i].includes(cell));
        // Water-fill each cell equally; weak contributors can give only their available share.
        const limits = offers.slice();
        while (needs[cell] > 1e-9 && donors.length) {
          const share = needs[cell] / donors.length;
          for (const i of donors) {
            const amount = Math.min(share, limits[i], contributors[i].remaining);
            contributors[i].remaining -= amount;
            limits[i] -= amount;
            needs[cell] -= amount;
            added[cell] += amount;
          }
          donors = donors.filter((i) => limits[i] > 1e-9 && contributors[i].remaining > 1e-9);
        }
      }
    }
  }
  for (let cell = 0; cell < health.length; cell++)
    health[cell] = Math.max(0, Math.min(100, health[cell] + added[cell] - negative[cell]));
}
