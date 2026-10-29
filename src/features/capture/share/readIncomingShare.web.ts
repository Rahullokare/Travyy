import { sharedContentFromPayloads, type SharedContent } from './parseShare';

/**
 * On web, shares arrive as query params (Web Share Target / links):
 * /expo-sharing?url=…&text=…&title=…  — same shape the PWA manifest's share_target uses.
 */
export function readIncomingShare(): SharedContent | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const text = [params.get('title'), params.get('text')].filter(Boolean).join('\n');
  return sharedContentFromPayloads([
    { value: params.get('url') ?? '', shareType: 'url' },
    { value: text, shareType: 'text' },
  ]);
}
