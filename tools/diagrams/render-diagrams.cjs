// Render the Mermaid subset used in the technical documents with Graphviz.
// Usage from the repository root:
// node tools/diagrams/render-diagrams.cjs <node-modules-path> [--implementation]
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const runtime = process.argv[2];
if (!runtime) throw new Error('Pass a node_modules directory containing @viz-js/viz and sharp as the first argument.');
// Give the PNG renderer the same Arial-compatible metrics used in the SVG.
if (process.platform === 'win32') {
  const configPath = path.join(os.tmpdir(), 'scrapworks-diagram-fonts.conf');
  fs.writeFileSync(configPath, '<fontconfig><dir>C:/Windows/Fonts</dir><cachedir>' + os.tmpdir().replaceAll('\\', '/') + '</cachedir></fontconfig>');
  process.env.FONTCONFIG_FILE = configPath;
}
const { instance } = require(path.join(runtime, '@viz-js/viz/dist/viz.cjs'));
const sharp = require(path.join(runtime, 'sharp'));
const repositoryDirectory = path.resolve(__dirname, '..', '..');
const outputDirectory = path.join(repositoryDirectory, 'docs', 'diagrams');
const sourceDirectory = path.join(outputDirectory, 'src');
fs.mkdirSync(sourceDirectory, { recursive: true });
const implementationMode = process.argv[3] === '--implementation';
if (process.argv[3] && !implementationMode) throw new Error('Unknown diagram selection. Use --implementation or omit it.');
const documentPath = implementationMode
  ? path.join(repositoryDirectory, 'docs', 'plans', 'README.md')
  : path.join(repositoryDirectory, 'docs', 'design', 'TDD.md');
const blocks = [...fs.readFileSync(documentPath, 'utf8').matchAll(/```mermaid\r?\n([\s\S]*?)```/g)].map((match) => match[1].trim());
const expectedBlocks = implementationMode ? 5 : 3;
if (blocks.length !== expectedBlocks) throw new Error(`Expected ${expectedBlocks} Mermaid diagrams in ${documentPath}.`);

const quote = (text) => JSON.stringify(text);
const escapeHtml = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const wrap = (text, width = 27) => {
  const lines = [''];
  for (const word of text.split(/\s+/)) {
    const last = lines.length - 1;
    if (lines[last] && lines[last].length + word.length + 1 > width) lines.push(word);
    else lines[last] += (lines[last] ? ' ' : '') + word;
  }
  return lines.join('\n');
};
const base = (title, direction = 'TB') => `digraph G {
  graph [rankdir=${direction}, bgcolor="white", pad=0.35, nodesep=0.45, ranksep=0.8, fontname="Helvetica", fontsize=21, label=${quote(title)}, labelloc=t, splines=spline];
  node [fontname="Helvetica", fontsize=14, color="#64748b", penwidth=1.1, margin="0.2,0.15"];
  edge [fontname="Helvetica", fontsize=11, color="#64748b", fontcolor="#334155", arrowsize=0.75];
`;

function classGraph(source, title) {
  let dot = base(title);
  const nodeNames = new Set();
  for (const match of source.matchAll(/class (\w+) \{([\s\S]*?)\}/g)) {
    const name = match[1];
    nodeNames.add(name);
    const members = match[2]
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const kind = members.find((line) => line.startsWith('<<'));
    const body = members.filter((line) => !line.startsWith('<<'));
    const fill = kind === '<<data>>' ? '#dcfce7' : kind === '<<interface>>' ? '#ede9fe' : '#dbeafe';
    const rows = body.map((member) => `<TR><TD ALIGN="LEFT">${escapeHtml(member)}</TD></TR>`).join('');
    const header = (kind ? `<FONT POINT-SIZE="11">${escapeHtml(kind)}</FONT><BR/>` : '') + `<B>${name}</B>`;
    dot += `${name} [shape=plain, label=<<TABLE BORDER="1" COLOR="#64748b" CELLBORDER="0" CELLSPACING="0" CELLPADDING="8"><TR><TD BGCOLOR="${fill}">${header}</TD></TR>${rows}</TABLE>>];\n`;
  }
  let relationCount = 0;
  const relations = /^\s*(\w+)(?: "([^"]+)")? (-->|\*--|o--|\.\.>|\.\.\|>)(?: "([^"]+)")? (\w+) : (.+)$/gm;
  for (const match of source.matchAll(relations)) {
    relationCount++;
    const [, from, fromCount, type, toCount, to, label] = match;
    if (!nodeNames.has(from) || !nodeNames.has(to)) throw new Error(`Unknown class on edge: ${from} -> ${to}`);
    const attributes = [`label=${quote(wrap(label, 22))}`];
    if (type === '*--' || type === 'o--') attributes.push('dir=back', `arrowtail=${type === '*--' ? 'diamond' : 'odiamond'}`, 'arrowhead=none');
    if (type === '..>') {
      attributes.push('style=dashed');
      if (to === 'GameState') attributes.push('constraint=false');
    }
    if (type === '..|>') attributes.push('style=dashed', 'arrowhead=empty');
    if (fromCount) attributes.push(`taillabel=${quote(fromCount)}`);
    if (toCount) attributes.push(`headlabel=${quote(toCount)}`);
    dot += `${from} -> ${to} [${attributes.join(', ')}];\n`;
  }
  if (relationCount !== 13) throw new Error(`Expected 13 class relationships, found ${relationCount}.`);
  return dot + '}';
}

function flowGraph(source, title) {
  const direction = source.match(/^flowchart (TB|LR)\b/)?.[1];
  if (!direction) throw new Error('Expected a TB or LR flowchart.');
  let dot = base(title, direction);
  const nodes = new Map();
  const clusters = new Map();
  const edges = [];
  let currentCluster = null;
  for (const rawLine of source.split(/\r?\n/).slice(1)) {
    const line = rawLine.trim();
    if (!line) continue;
    const cluster = line.match(/^subgraph (\w+)\[(.+)\]$/);
    if (cluster) {
      currentCluster = cluster[1];
      clusters.set(currentCluster, { label: cluster[2], nodes: [] });
      continue;
    }
    if (line === 'end') {
      currentCluster = null;
      continue;
    }
    const node = line.match(/^(\w+)(?:\[(.+)\]|\{(.+)\})$/);
    if (node) {
      const decision = Boolean(node[3]);
      const rawLabel = node[2] || node[3];
      const database = !decision && rawLabel.startsWith('(') && rawLabel.endsWith(')');
      const label = database ? rawLabel.slice(1, -1) : rawLabel;
      const fill = decision ? '#fef3c7' : currentCluster === 'Persistence' ? '#ede9fe' : currentCluster === 'Gameplay' ? '#dcfce7' : '#dbeafe';
      nodes.set(
        node[1],
        `${node[1]} [shape=${decision ? 'diamond' : database ? 'cylinder' : 'box'}, style="rounded,filled", fillcolor="${fill}", label=${quote(wrap(label))}];\n`,
      );
      if (currentCluster) clusters.get(currentCluster).nodes.push(node[1]);
      continue;
    }
    const edge = line.match(/^(\w+) (-->|<-->)\|([^|]+)\| (\w+)$/);
    if (edge) {
      edges.push(edge);
      continue;
    }
    throw new Error(`Unsupported Mermaid line: ${line}`);
  }
  const clustered = new Set();
  for (const [id, cluster] of clusters) {
    dot += `subgraph cluster_${id} { label=${quote(cluster.label)}; color="#cbd5e1"; style="rounded"; bgcolor="#f8fafc"; fontsize=16;\n`;
    for (const name of cluster.nodes) {
      dot += nodes.get(name);
      clustered.add(name);
    }
    dot += '}\n';
  }
  for (const [name, definition] of nodes) if (!clustered.has(name)) dot += definition;
  for (const [, from, type, label, to] of edges) {
    if (!nodes.has(from) || !nodes.has(to)) throw new Error(`Unknown flow node: ${from} -> ${to}`);
    const attributes = [`label=${quote(wrap(label, 22))}`];
    if (type === '<-->') attributes.push('dir=both');
    // View publishing is a feedback path, rather than a new layout stage.
    if (from === 'Views' || to === 'Views' || to === 'Frame' || (from === 'Deduct' && to === 'Enough')) attributes.push('constraint=false');
    dot += `${from} -> ${to} [${attributes.join(', ')}];\n`;
  }
  return dot + '}';
}

(async () => {
  const viz = await instance();
  const diagrams = implementationMode
    ? [
        { name: 'module-dependencies', title: 'Scrapworks module dependencies', build: flowGraph },
        { name: 'fixed-step-loop', title: 'Scrapworks fixed-step loop', build: flowGraph },
        { name: 'save-flow', title: 'Scrapworks save flow', build: flowGraph },
        { name: 'load-flow', title: 'Scrapworks load flow', build: flowGraph },
        { name: 'research-transaction', title: 'Scrapworks research transaction', build: flowGraph },
      ]
    : [
        { name: 'core-class-diagram', title: 'Scrapworks core classes', build: classGraph },
        { name: 'system-interactions', title: 'Scrapworks application systems', build: flowGraph },
        { name: 'gameplay-interactions', title: 'Scrapworks gameplay systems', build: flowGraph },
      ];
  for (let index = 0; index < diagrams.length; index++) {
    const { name, title, build } = diagrams[index];
    const source = blocks[index];
    const dot = build(source, title);
    const result = viz.render(dot, { format: 'svg', engine: 'dot' });
    if (result.status !== 'success' || result.errors.length) throw new Error(JSON.stringify(result.errors));
    fs.writeFileSync(path.join(sourceDirectory, `${name}.mmd`), source + '\n');
    const svg = result.output.replaceAll('Helvetica,sans-Serif', 'Arial,sans-serif');
    fs.writeFileSync(path.join(outputDirectory, `${name}.svg`), svg);
    const pngPath = path.join(outputDirectory, `${name}.png`);
    await sharp(Buffer.from(svg), { density: 96 }).resize({ width: 2400, height: 2800, fit: 'inside', withoutEnlargement: true }).png().toFile(pngPath);
    const { width, height } = await sharp(pngPath).metadata();
    console.log(`${name}: ${width} x ${height}; Mermaid, SVG and PNG saved.`);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
