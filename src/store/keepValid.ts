import { logger } from '@/shared/lib/logger';

/** Keep the records that pass `schema`. A bad one is dropped and logged instead of crashing the app. */
export function keepValid<T>(
  items: unknown,
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
): T[] {
  if (!Array.isArray(items)) return [];
  const valid: T[] = [];
  for (const item of items) {
    const result = schema.safeParse(item);
    if (result.success) valid.push(result.data as T);
    else logger.warn('Dropped invalid persisted record', { item });
  }
  return valid;
}
