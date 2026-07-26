export const blockedLogoHashes = [
  "8f8f87878383c3e7", // WordPress-logo
  "0f1f3f7f7e7c3800", // Domeneshop-placeholder
];

const HASH_WIDTH = 9;
const HASH_HEIGHT = 8;
const MAX_HAMMING_DISTANCE = 6;

export function calculateLogoHash(image: CanvasImageSource): string {
  const canvas = document.createElement("canvas");
  canvas.width = HASH_WIDTH;
  canvas.height = HASH_HEIGHT;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Nettleseren støtter ikke bildeanalyse.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, HASH_WIDTH, HASH_HEIGHT);
  context.drawImage(image, 0, 0, HASH_WIDTH, HASH_HEIGHT);

  const pixels = context.getImageData(0, 0, HASH_WIDTH, HASH_HEIGHT).data;
  let hash = 0n;

  for (let y = 0; y < HASH_HEIGHT; y += 1) {
    for (let x = 0; x < HASH_WIDTH - 1; x += 1) {
      const leftIndex = (y * HASH_WIDTH + x) * 4;
      const rightIndex = leftIndex + 4;
      const leftBrightness = pixelBrightness(pixels, leftIndex);
      const rightBrightness = pixelBrightness(pixels, rightIndex);

      hash = (hash << 1n) | (leftBrightness > rightBrightness ? 1n : 0n);
    }
  }

  return hash.toString(16).padStart(16, "0");
}

export function hammingDistance(hashA: string, hashB: string): number {
  const a = BigInt(`0x${hashA}`);
  const b = BigInt(`0x${hashB}`);
  let value = a ^ b;
  let distance = 0;

  while (value > 0n) {
    distance += Number(value & 1n);
    value >>= 1n;
  }

  return distance;
}

export function isBlacklistedHash(hash: string): boolean {
  return blockedLogoHashes.some(
    (blockedHash) => hammingDistance(hash, blockedHash) <= MAX_HAMMING_DISTANCE,
  );
}

function pixelBrightness(pixels: Uint8ClampedArray, index: number) {
  return (
    pixels[index] * 0.299
    + pixels[index + 1] * 0.587
    + pixels[index + 2] * 0.114
  );
}
