import * as Crypto from 'expo-crypto';

/** RFC 4122 v4 id. Stable across devices, so records can sync to a backend later without remapping. */
export function newId(): string {
  try {
    const id = Crypto.randomUUID();
    if (id) return id;
  } catch {
    // Fall through: some test environments mock expo-crypto without randomUUID.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
