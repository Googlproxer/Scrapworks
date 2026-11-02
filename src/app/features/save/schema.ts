export interface TestData {
  id: number;
  name: string;
  value: number;
}

export function assertTestData(value: unknown): asserts value is TestData {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid developer test record.');
  const record = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(record['id']) ||
    Number(record['id']) < 1 ||
    typeof record['name'] !== 'string' ||
    record['name'].length > 256 ||
    typeof record['value'] !== 'number' ||
    !Number.isFinite(record['value']) ||
    Object.keys(record).some((key) => !['id', 'name', 'value'].includes(key))
  )
    throw new Error('Invalid developer test record.');
}
