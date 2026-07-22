const BYTE_CHUNK_SIZE = 0x8000;

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += BYTE_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BYTE_CHUNK_SIZE));
  }

  return btoa(binary);
}

export async function blobToBase64(blob: Blob) {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}
