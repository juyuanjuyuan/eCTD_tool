/**
 * Parse a dual-provider JSON field.
 * - PostgreSQL Prisma client returns object/array directly.
 * - SQLite variant stores JSON as string.
 */
export function parseJsonField<T>(
  raw: string | T | null | undefined,
  fallback: T,
): T {
  if (raw === null || raw === undefined) {
    return fallback;
  }

  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  return raw as T;
}

/**
 * Serialize a dual-provider JSON field.
 * - SQLite: stringify
 * - PostgreSQL: keep object value
 */
export function serializeJsonField<T>(value: T): T | string {
  if (process.env.DB_PROVIDER === 'sqlite') {
    return JSON.stringify(value);
  }

  return value;
}
