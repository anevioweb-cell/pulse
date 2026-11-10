/**
 * The single value of `key`, or null when it is missing, repeated or longer than `maxLength`.
 * Shared by the URL-state parsers: a repeated or oversized value is never ours (ADR 0021).
 */
export function singleParam(
  params: URLSearchParams,
  key: string,
  maxLength: number,
): string | null {
  const values = params.getAll(key);
  if (values.length !== 1) return null;
  const [value] = values;
  if (value === undefined || value.length > maxLength) return null;
  return value;
}
