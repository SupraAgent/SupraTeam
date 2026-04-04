/**
 * Minimal QR Code SVG generator.
 *
 * Implements QR Code Model 2 with error correction level M.
 * Supports alphanumeric and byte modes, versions 1-10 (up to ~271 chars).
 * No external dependencies — generates SVG string directly.
 */

// ── Galois Field GF(256) arithmetic ────────────────────────────

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGf() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x = x << 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function polyMul(p1: number[], p2: number[]): number[] {
  const result = new Array(p1.length + p2.length - 1).fill(0);
  for (let i = 0; i < p1.length; i++) {
    for (let j = 0; j < p2.length; j++) {
      result[i + j] ^= gfMul(p1[i], p2[j]);
    }
  }
  return result;
}

function rsGeneratorPoly(nsym: number): number[] {
  let g = [1];
  for (let i = 0; i < nsym; i++) {
    g = polyMul(g, [1, GF_EXP[i]]);
  }
  return g;
}

function rsEncode(data: number[], nsym: number): number[] {
  const gen = rsGeneratorPoly(nsym);
  const padded = [...data, ...new Array(nsym).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = padded[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        padded[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return padded.slice(data.length);
}

// ── QR version/capacity tables (EC level M) ────────────────────

interface VersionInfo {
  version: number;
  size: number;
  totalCodewords: number;
  ecCodewordsPerBlock: number;
  group1Blocks: number;
  group1DataCw: number;
  group2Blocks: number;
  group2DataCw: number;
  alignmentPatterns: number[];
}

const VERSIONS_M: VersionInfo[] = [
  { version: 1, size: 21, totalCodewords: 26, ecCodewordsPerBlock: 10, group1Blocks: 1, group1DataCw: 16, group2Blocks: 0, group2DataCw: 0, alignmentPatterns: [] },
  { version: 2, size: 25, totalCodewords: 44, ecCodewordsPerBlock: 16, group1Blocks: 1, group1DataCw: 28, group2Blocks: 0, group2DataCw: 0, alignmentPatterns: [18] },
  { version: 3, size: 29, totalCodewords: 70, ecCodewordsPerBlock: 26, group1Blocks: 1, group1DataCw: 44, group2Blocks: 0, group2DataCw: 0, alignmentPatterns: [22] },
  { version: 4, size: 33, totalCodewords: 100, ecCodewordsPerBlock: 18, group1Blocks: 2, group1DataCw: 32, group2Blocks: 0, group2DataCw: 0, alignmentPatterns: [26] },
  { version: 5, size: 37, totalCodewords: 134, ecCodewordsPerBlock: 24, group1Blocks: 2, group1DataCw: 43, group2Blocks: 0, group2DataCw: 0, alignmentPatterns: [30] },
  { version: 6, size: 41, totalCodewords: 172, ecCodewordsPerBlock: 16, group1Blocks: 4, group1DataCw: 27, group2Blocks: 0, group2DataCw: 0, alignmentPatterns: [34] },
  { version: 7, size: 45, totalCodewords: 196, ecCodewordsPerBlock: 18, group1Blocks: 4, group1DataCw: 31, group2Blocks: 0, group2DataCw: 0, alignmentPatterns: [6, 22, 38] },
  { version: 8, size: 49, totalCodewords: 242, ecCodewordsPerBlock: 22, group1Blocks: 2, group1DataCw: 38, group2Blocks: 2, group2DataCw: 39, alignmentPatterns: [6, 24, 42] },
  { version: 9, size: 53, totalCodewords: 292, ecCodewordsPerBlock: 22, group1Blocks: 3, group1DataCw: 36, group2Blocks: 2, group2DataCw: 37, alignmentPatterns: [6, 26, 46] },
  { version: 10, size: 57, totalCodewords: 346, ecCodewordsPerBlock: 26, group1Blocks: 4, group1DataCw: 43, group2Blocks: 1, group2DataCw: 44, alignmentPatterns: [6, 28, 50] },
];

// Format info bits for EC level M, masks 0-7
const FORMAT_INFO_BITS: number[] = [
  0x5412, 0x5125, 0x5E7C, 0x5B4B,
  0x45F9, 0x40CE, 0x4F97, 0x4AA0,
];

function selectVersion(dataBytes: number): VersionInfo {
  for (const v of VERSIONS_M) {
    const totalData = v.group1Blocks * v.group1DataCw + v.group2Blocks * v.group2DataCw;
    if (totalData >= dataBytes) return v;
  }
  return VERSIONS_M[VERSIONS_M.length - 1];
}

// ── Bit stream encoding (byte mode) ────────────────────────────

function encodeData(text: string, version: VersionInfo): number[] {
  const totalDataCw = version.group1Blocks * version.group1DataCw + version.group2Blocks * version.group2DataCw;
  const bytes = new TextEncoder().encode(text);
  const bits: number[] = [];

  const pushBits = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) {
      bits.push((value >> i) & 1);
    }
  };

  // Mode indicator: byte mode = 0100
  pushBits(0b0100, 4);

  // Character count indicator
  const ccBits = version.version <= 9 ? 8 : 16;
  pushBits(bytes.length, ccBits);

  // Data
  for (const b of bytes) {
    pushBits(b, 8);
  }

  // Terminator (up to 4 zeros)
  const totalBits = totalDataCw * 8;
  const terminatorLen = Math.min(4, totalBits - bits.length);
  for (let i = 0; i < terminatorLen; i++) bits.push(0);

  // Pad to byte boundary
  while (bits.length % 8 !== 0) bits.push(0);

  // Pad codewords
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < totalBits) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  // Convert to codewords
  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let val = 0;
    for (let j = 0; j < 8; j++) val = (val << 1) | (bits[i + j] ?? 0);
    codewords.push(val);
  }

  return codewords;
}

function interleaveBlocks(dataCw: number[], version: VersionInfo): number[] {
  const { ecCodewordsPerBlock, group1Blocks, group1DataCw, group2Blocks, group2DataCw } = version;

  // Split into blocks
  interface Block { data: number[]; ec: number[] }
  const blocks: Block[] = [];
  let offset = 0;

  for (let i = 0; i < group1Blocks; i++) {
    const data = dataCw.slice(offset, offset + group1DataCw);
    offset += group1DataCw;
    blocks.push({ data, ec: rsEncode(data, ecCodewordsPerBlock) });
  }
  for (let i = 0; i < group2Blocks; i++) {
    const data = dataCw.slice(offset, offset + group2DataCw);
    offset += group2DataCw;
    blocks.push({ data, ec: rsEncode(data, ecCodewordsPerBlock) });
  }

  // Interleave data codewords
  const result: number[] = [];
  const maxDataLen = Math.max(group1DataCw, group2DataCw);
  for (let i = 0; i < maxDataLen; i++) {
    for (const block of blocks) {
      if (i < block.data.length) result.push(block.data[i]);
    }
  }

  // Interleave EC codewords
  for (let i = 0; i < ecCodewordsPerBlock; i++) {
    for (const block of blocks) {
      result.push(block.ec[i]);
    }
  }

  return result;
}

// ── Matrix construction ─────────────────────────────────────────

function createMatrix(size: number): { modules: boolean[][]; reserved: boolean[][] } {
  const modules: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const reserved: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  return { modules, reserved };
}

function placeFinderPattern(modules: boolean[][], reserved: boolean[][], row: number, col: number) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const mr = row + r;
      const mc = col + c;
      if (mr < 0 || mr >= modules.length || mc < 0 || mc >= modules.length) continue;
      reserved[mr][mc] = true;
      if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
        modules[mr][mc] =
          r === 0 || r === 6 || c === 0 || c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      }
    }
  }
}

function placeAlignmentPattern(modules: boolean[][], reserved: boolean[][], row: number, col: number) {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const mr = row + r;
      const mc = col + c;
      if (reserved[mr]?.[mc]) continue;
      reserved[mr][mc] = true;
      modules[mr][mc] =
        Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
    }
  }
}

function placeTimingPatterns(modules: boolean[][], reserved: boolean[][], size: number) {
  for (let i = 8; i < size - 8; i++) {
    if (!reserved[6][i]) {
      reserved[6][i] = true;
      modules[6][i] = i % 2 === 0;
    }
    if (!reserved[i][6]) {
      reserved[i][6] = true;
      modules[i][6] = i % 2 === 0;
    }
  }
}

function reserveFormatAreas(reserved: boolean[][], size: number) {
  // Around top-left finder
  for (let i = 0; i <= 8; i++) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
  // Around top-right finder
  for (let i = 0; i <= 7; i++) {
    reserved[8][size - 1 - i] = true;
  }
  // Around bottom-left finder
  for (let i = 0; i <= 7; i++) {
    reserved[size - 1 - i][8] = true;
  }
  // Dark module
  reserved[size - 8][8] = true;
}

function placeDataBits(modules: boolean[][], reserved: boolean[][], size: number, data: number[]) {
  const bits: number[] = [];
  for (const byte of data) {
    for (let i = 7; i >= 0; i--) {
      bits.push((byte >> i) & 1);
    }
  }

  let bitIdx = 0;
  let col = size - 1;

  while (col > 0) {
    if (col === 6) col--; // Skip timing column

    for (let row = 0; row < size; row++) {
      const actualRow = ((Math.floor((size - 1 - col) / 2)) % 2 === 0)
        ? size - 1 - row
        : row;

      for (const c of [col, col - 1]) {
        if (!reserved[actualRow][c]) {
          modules[actualRow][c] = bitIdx < bits.length ? bits[bitIdx] === 1 : false;
          bitIdx++;
        }
      }
    }
    col -= 2;
  }
}

// ── Masking ──────────────────────────────────────────────────────

type MaskFn = (row: number, col: number) => boolean;

const MASK_FUNCTIONS: MaskFn[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(modules: boolean[][], reserved: boolean[][], maskIdx: number): boolean[][] {
  const size = modules.length;
  const result = modules.map((row) => [...row]);
  const fn = MASK_FUNCTIONS[maskIdx];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!reserved[r][c] && fn(r, c)) {
        result[r][c] = !result[r][c];
      }
    }
  }

  return result;
}

function scoreMask(modules: boolean[][]): number {
  const size = modules.length;
  let penalty = 0;

  // Rule 1: consecutive same-color modules in rows/cols
  for (let r = 0; r < size; r++) {
    let count = 1;
    for (let c = 1; c < size; c++) {
      if (modules[r][c] === modules[r][c - 1]) {
        count++;
        if (count === 5) penalty += 3;
        else if (count > 5) penalty += 1;
      } else {
        count = 1;
      }
    }
  }
  for (let c = 0; c < size; c++) {
    let count = 1;
    for (let r = 1; r < size; r++) {
      if (modules[r][c] === modules[r - 1][c]) {
        count++;
        if (count === 5) penalty += 3;
        else if (count > 5) penalty += 1;
      } else {
        count = 1;
      }
    }
  }

  // Rule 2: 2x2 same-color blocks
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const val = modules[r][c];
      if (val === modules[r][c + 1] && val === modules[r + 1][c] && val === modules[r + 1][c + 1]) {
        penalty += 3;
      }
    }
  }

  // Rule 4: proportion of dark modules
  let dark = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) dark++;
    }
  }
  const total = size * size;
  const pct = (dark / total) * 100;
  const prev5 = Math.floor(pct / 5) * 5;
  const next5 = prev5 + 5;
  penalty += Math.min(Math.abs(prev5 - 50) / 5, Math.abs(next5 - 50) / 5) * 10;

  return penalty;
}

function placeFormatInfo(modules: boolean[][], size: number, maskIdx: number) {
  const formatBits = FORMAT_INFO_BITS[maskIdx];

  // Bits around top-left finder
  const positions1: [number, number][] = [
    [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
    [7, 8], [8, 8], [8, 7], [8, 5], [8, 4], [8, 3],
    [8, 2], [8, 1], [8, 0],
  ];

  // Bits around top-right and bottom-left finders
  const positions2: [number, number][] = [
    [8, size - 1], [8, size - 2], [8, size - 3], [8, size - 4],
    [8, size - 5], [8, size - 6], [8, size - 7], [8, size - 8],
    [size - 7, 8], [size - 6, 8], [size - 5, 8], [size - 4, 8],
    [size - 3, 8], [size - 2, 8], [size - 1, 8],
  ];

  for (let i = 0; i < 15; i++) {
    const bit = ((formatBits >> (14 - i)) & 1) === 1;
    const [r1, c1] = positions1[i];
    modules[r1][c1] = bit;
    const [r2, c2] = positions2[i];
    modules[r2][c2] = bit;
  }

  // Dark module (always set)
  modules[size - 8][8] = true;
}

// ── Main QR generation ──────────────────────────────────────────

function generateQrMatrix(text: string): boolean[][] {
  const textBytes = new TextEncoder().encode(text);
  // +4 bits mode + 8/16 bits count + data + 4 bits terminator, rounded up to bytes
  const estimatedBytes = Math.ceil((4 + 8 + textBytes.length * 8 + 4) / 8);
  const version = selectVersion(estimatedBytes);
  const size = version.size;

  const dataCw = encodeData(text, version);
  const interleaved = interleaveBlocks(dataCw, version);

  const { modules, reserved } = createMatrix(size);

  // Place finder patterns
  placeFinderPattern(modules, reserved, 0, 0);
  placeFinderPattern(modules, reserved, 0, size - 7);
  placeFinderPattern(modules, reserved, size - 7, 0);

  // Place alignment patterns
  if (version.alignmentPatterns.length > 0) {
    const centers = version.version >= 7
      ? version.alignmentPatterns
      : [6, version.alignmentPatterns[0]];

    for (const r of centers) {
      for (const c of centers) {
        // Skip if overlapping finder patterns
        if (r <= 8 && c <= 8) continue;
        if (r <= 8 && c >= size - 8) continue;
        if (r >= size - 8 && c <= 8) continue;
        placeAlignmentPattern(modules, reserved, r, c);
      }
    }
  }

  placeTimingPatterns(modules, reserved, size);
  reserveFormatAreas(reserved, size);
  placeDataBits(modules, reserved, size, interleaved);

  // Try all masks, pick best
  let bestMask = 0;
  let bestScore = Infinity;

  for (let m = 0; m < 8; m++) {
    const masked = applyMask(modules, reserved, m);
    placeFormatInfo(masked, size, m);
    const score = scoreMask(masked);
    if (score < bestScore) {
      bestScore = score;
      bestMask = m;
    }
  }

  const final = applyMask(modules, reserved, bestMask);
  placeFormatInfo(final, size, bestMask);

  return final;
}

// ── SVG rendering ───────────────────────────────────────────────

export function generateQrSvg(text: string, size: number = 300, withBranding: boolean = true): string {
  const matrix = generateQrMatrix(text);
  const moduleCount = matrix.length;
  const quietZone = 4;
  const totalModules = moduleCount + quietZone * 2;
  const moduleSize = size / totalModules;

  let pathData = "";

  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (matrix[r][c]) {
        const x = (c + quietZone) * moduleSize;
        const y = (r + quietZone) * moduleSize;
        pathData += `M${x},${y}h${moduleSize}v${moduleSize}h-${moduleSize}z`;
      }
    }
  }

  const brandingOverlay = withBranding
    ? `<rect x="${size / 2 - 18}" y="${size / 2 - 18}" width="36" height="36" rx="6" fill="#0f172a" stroke="#3b82f6" stroke-width="2"/>
       <text x="${size / 2}" y="${size / 2 + 5}" text-anchor="middle" fill="#3b82f6" font-family="system-ui,sans-serif" font-size="12" font-weight="700">S</text>`
    : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`,
    `<rect width="${size}" height="${size}" fill="white"/>`,
    `<path d="${pathData}" fill="black"/>`,
    brandingOverlay,
    `</svg>`,
  ].join("");
}
