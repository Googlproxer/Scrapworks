/** Plain JSON data: object member order is immaterial; array order remains significant. */
export function sameData(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left))
    return (
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameData(value, right[index]))
    );
  if (
    !left ||
    !right ||
    typeof left !== 'object' ||
    typeof right !== 'object' ||
    Array.isArray(right)
  )
    return false;
  const a = left as Record<string, unknown>,
    b = right as Record<string, unknown>,
    keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && sameData(a[key], b[key]))
  );
}
