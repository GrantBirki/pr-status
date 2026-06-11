/**
 * Parse a comma-separated action input and trim non-empty values.
 */
export function stringToArray(value: unknown): string[] {
  if (typeof value !== 'string' || value.trim() === '') {
    return []
  }

  const values: string[] = []

  for (const item of value.split(',')) {
    const trimmed = item.trim()
    if (trimmed !== '') {
      values.push(trimmed)
    }
  }

  return values
}
