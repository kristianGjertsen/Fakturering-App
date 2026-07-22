const BYTE_CHUNK_SIZE = 0x8000;

export function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += BYTE_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BYTE_CHUNK_SIZE));
  }

  return btoa(binary);
}

export async function blobToBase64(blob: Blob) {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}
