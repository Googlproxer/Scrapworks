import type { OpeningTechnology } from '@content/opening';

interface Vertex {
  id: string;
  rank: number;
  before: string[];
  after: string[];
}

/** Static layered DAG: dummy vertices reserve clear lanes for edges spanning several columns. */
export function technologyTree(technologies: readonly OpeningTechnology[]) {
  const vertices = new Map<string, Vertex>();

  const rank = (technology: OpeningTechnology): number => {
    const previous = vertices.get(technology.id);
    if (previous) return previous.rank;
    const value = technology.requires.length
      ? 1 +
        Math.max(...technology.requires.map((id) => rank(technologies.find((t) => t.id === id)!)))
      : 0;
    vertices.set(technology.id, { id: technology.id, rank: value, before: [], after: [] });
    return value;
  };

  technologies.forEach(rank);
  const edges = technologies.flatMap((technology) =>
    technology.requires.map((from) => {
      const chain = [from];
      for (let column = vertices.get(from)!.rank + 1; column < rank(technology); column++) {
        const id = `${from}:${technology.id}:${column}`;
        vertices.set(id, { id, rank: column, before: [], after: [] });
        chain.push(id);
      }
      chain.push(technology.id);
      for (let index = 1; index < chain.length; index++) {
        vertices.get(chain[index - 1])!.after.push(chain[index]);
        vertices.get(chain[index])!.before.push(chain[index - 1]);
      }
      return { from, to: technology.id, chain };
    }),
  );
  const columns = Array.from(
    { length: Math.max(...[...vertices.values()].map((v) => v.rank)) + 1 },
    (_, column) => [...vertices.values()].filter((v) => v.rank === column),
  );
  // Stable barycentre sweeps reduce crossings without reacting to live research state.
  for (let pass = 0; pass < 4; pass++) {
    const forward = pass % 2 === 0;
    for (const column of forward ? columns : [...columns].reverse()) {
      const position = new Map(
        columns.flatMap((entries) => entries.map((v, index) => [v.id, index] as const)),
      );

      const center = (v: Vertex) => {
        const neighbours = forward ? v.before : v.after;
        return neighbours.length
          ? neighbours.reduce((total, id) => total + position.get(id)!, 0) / neighbours.length
          : position.get(v.id)!;
      };

      column.sort((a, b) => center(a) - center(b));
    }
  }
  const rows = Math.max(...columns.map((column) => column.length));
  const points = new Map(
    columns.flatMap((column, x) =>
      column.map(
        (v, y) =>
          [v.id, { x: 24 + x * 244, y: 24 + (y + (rows - column.length) / 2) * 120 }] as const,
      ),
    ),
  );
  const nodes = technologies.map((technology) => ({ technology, ...points.get(technology.id)! }));
  return {
    nodes,
    width: columns.length * 244,
    height: rows * 120 + 24,
    edges: edges.map(({ from, to, chain }) => {
      const start = points.get(from)!;
      let path = `M ${start.x + 184} ${start.y + 44}`;
      for (let index = 1; index < chain.length; index++) {
        const a = points.get(chain[index - 1])!,
          b = points.get(chain[index])!;
        const ax = a.x + (index === 1 ? 184 : 92),
          bx = b.x + (index === chain.length - 1 ? 0 : 92);
        const midpoint = (ax + bx) / 2;
        path += ` C ${midpoint} ${a.y + 44}, ${midpoint} ${b.y + 44}, ${bx} ${b.y + 44}`;
      }
      return { from, to, path };
    }),
  };
}
