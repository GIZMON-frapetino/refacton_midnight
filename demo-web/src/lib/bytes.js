export function randomBytes32() {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return buf;
}

export function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex) {
  if (typeof hex !== 'string') {
    throw new Error('Expected a hex string');
  }
  const cleaned = hex.replace(/^0x/i, '').replace(/\s/g, '');
  if (cleaned.length !== 64) {
    throw new Error('Expected 32 bytes (64 hex characters)');
  }
  if (!/^[0-9a-f]{64}$/i.test(cleaned)) {
    throw new Error('Invalid hex');
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    const byte = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error('Invalid hex');
    }
    out[i] = byte;
  }
  return out;
}

export function truncateHex(hex, head = 8, tail = 8) {
  if (hex.length <= head + tail + 3) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}
