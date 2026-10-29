/** Output location and resume do not change an experiment; all other flags do. */
export function runSignature(argv) {
  const [command, ...tokens] = argv;
  const settings = new Map();
  for (let index = 0; index < tokens.length; index++) {
    const flag = tokens[index];
    if (flag === '--resume') continue;
    if (flag === '--output') {
      index++;
      continue;
    }
    if (!flag.startsWith('--')) throw new Error(`Unexpected argument ${flag}`);
    const next = tokens[index + 1];
    if (next && !next.startsWith('--')) {
      settings.set(flag, next);
      index++;
    } else settings.set(flag, true);
  }
  return JSON.stringify({
    command,
    settings: [...settings].sort(([a], [b]) => a.localeCompare(b)),
  });
}
