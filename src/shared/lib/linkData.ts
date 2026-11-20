/**
 * Data carried inside a link: base64url of UTF-8 JSON. Used by shared trips and shared vaults,
 * whose whole content travels in the URL so sharing needs no server.
 */
export function toLinkData(value: unknown): string {
  return toBase64Url(utf8Encode(JSON.stringify(value)));
}

/** Throws on anything that isn't base64url JSON. Callers validate the shape with zod. */
export function fromLinkData(encoded: string): unknown {
  return JSON.parse(utf8Decode(fromBase64Url(encoded)));
}

// Base64url and UTF-8 by hand: `btoa`, `TextEncoder` and `Buffer` aren't all present on every
// runtime the app ships to (Hermes, browsers, Jest), and this is small.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function toBase64Url(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    out += ALPHABET[a >> 2];
    out += ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (b !== undefined) out += ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (c !== undefined) out += ALPHABET[c & 63];
  }
  return out;
}

function fromBase64Url(text: string): number[] {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of text) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) throw new Error('Not base64url');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }
  return bytes;
}

function utf8Encode(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 63),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63),
      );
  }
  return bytes;
}

function utf8Decode(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i];
    const extra = b < 0x80 ? 0 : b < 0xe0 ? 1 : b < 0xf0 ? 2 : 3;
    let code = extra === 0 ? b : b & (0x3f >> extra);
    for (let j = 1; j <= extra; j++) code = (code << 6) | (bytes[i + j] & 63);
    out += String.fromCodePoint(code);
    i += extra + 1;
  }
  return out;
}
