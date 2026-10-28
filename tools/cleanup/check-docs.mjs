import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const failures = [];
let links = 0;

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.name === 'node_modules' || entry.name === '__pycache__') return [];
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function prose(text) {
  return text.replace(/^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2[ \t]*\r?$/gm, '');
}

function anchors(text) {
  const counts = new Map();
  const result = new Set();
  for (const match of prose(text).matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const base = match[1]
      .toLowerCase()
      .replace(/<[^>]*>/g, '')
      .replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '')
      .replace(/\s/g, '-');
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    result.add(base + (count ? `-${count}` : ''));
  }
  for (const match of text.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) result.add(match[1]);
  return result;
}

function check(file, raw) {
  if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(raw)) return;
  let href = raw.startsWith('<') ? raw.slice(1, raw.indexOf('>')) : raw.replace(/\s+["'][^"']*["']\s*$/, '');
  try {
    href = decodeURIComponent(href.replaceAll('\\ ', ' '));
  } catch {
    failures.push(`${file}: invalid URL ${raw}`);
    return;
  }
  const [name, fragment] = href.split('#');
  const target = name ? path.resolve(path.dirname(file), name) : file;
  links++;
  if (!fs.existsSync(target)) {
    failures.push(`${path.relative(root, file)}: missing ${raw}`);
    return;
  }
  if (fragment && /\.md$/i.test(target) && !anchors(fs.readFileSync(target, 'utf8')).has(fragment)) {
    failures.push(`${path.relative(root, file)}: missing anchor ${raw}`);
  }
}

const files = [
  path.join(root, 'README.md'),
  path.join(root, 'AGENTS.md'),
  path.join(root, 'assets/README.md'),
  ...walk(path.join(root, 'docs')).filter((file) => file.endsWith('.md')),
  ...walk(path.join(root, 'art')).filter((file) => file.endsWith('.md')),
  ...walk(path.join(root, 'tools')).filter((file) => file.endsWith('.md')),
];
for (const file of files) {
  const text = prose(fs.readFileSync(file, 'utf8'));
  for (const match of text.matchAll(/!?\[[^\]\n]*\]\((<[^>]*>|[^)\n]*)\)/g)) check(file, match[1]);
  for (const match of text.matchAll(/^\s{0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/gm)) check(file, match[1]);
}

const diagramSets = [
  ['docs/design/TDD.md', ['core-class-diagram', 'system-interactions', 'gameplay-interactions']],
  ['docs/plans/README.md', ['module-dependencies', 'fixed-step-loop', 'save-flow', 'load-flow', 'research-transaction']],
];
for (const [document, names] of diagramSets) {
  const blocks = [...fs.readFileSync(path.join(root, document), 'utf8').matchAll(/```mermaid\r?\n([\s\S]*?)```/g)].map((match) =>
    match[1].replaceAll('\r\n', '\n').trim(),
  );
  if (blocks.length !== names.length) failures.push(`${document}: expected ${names.length} Mermaid blocks, found ${blocks.length}`);
  for (const [index, name] of names.entries()) {
    const source = path.join(root, `docs/diagrams/src/${name}.mmd`);
    if (!fs.existsSync(source) || fs.readFileSync(source, 'utf8').replaceAll('\r\n', '\n').trim() !== blocks[index])
      failures.push(`${document}: regenerate ${name}`);
    for (const extension of ['svg', 'png'])
      if (!fs.existsSync(path.join(root, `docs/diagrams/${name}.${extension}`))) failures.push(`Missing ${name}.${extension}`);
  }
}

console.log(JSON.stringify({ documents: files.length, localLinks: links, diagramSources: 8, failures }, null, 2));
if (failures.length) process.exitCode = 1;
