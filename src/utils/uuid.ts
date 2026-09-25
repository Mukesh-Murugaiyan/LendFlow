/**
 * UUID validation utility to prevent PostgreSQL 22P02 "invalid input syntax for type uuid: ''" errors.
 */
export function isValidUUID(uuid?: string | null): boolean {
  if (!uuid || typeof uuid !== 'string') return false;
  const trimmed = uuid.trim();
  if (trimmed === '') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed);
}
