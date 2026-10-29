import { clearSharedPayloads, getSharedPayloads } from 'expo-sharing';
import { logger } from '@/shared/lib/logger';
import { sharedContentFromPayloads, type SharedContent } from './parseShare';

/**
 * Read (and consume) whatever another app shared with Travyy.
 * Returns null in Expo Go or any build without the share extension, where the
 * native calls are unavailable.
 */
export function readIncomingShare(): SharedContent | null {
  try {
    const content = sharedContentFromPayloads(getSharedPayloads());
    clearSharedPayloads();
    return content;
  } catch (error) {
    logger.warn('Reading shared content failed', { error: String(error) });
    return null;
  }
}
