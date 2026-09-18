// Pure layout math — no DOM access, no network calls. Figures out how many tiles a frame
// needs and where each one goes, so every tile comes out the same square size with no
// overlap or leftover whitespace, for any poster size or shape.
import { CONTAINER_MAX, TARGET_TILE_SIZE } from './constants.js';

export function computeContainerSize(frame) {
  const ratio = frame.w / frame.h;
  if (ratio >= 1) return { width: CONTAINER_MAX, height: CONTAINER_MAX / ratio };
  return { width: CONTAINER_MAX * ratio, height: CONTAINER_MAX };
}

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

// The smallest cols:rows ratio that exactly matches the frame's aspect ratio.
// A grid must be a whole multiple of this ratio for tiles to come out square
// (e.g. an 18x24 poster reduces to 3:4, so 3x4, 6x8, 9x12... all give square tiles).
export function getGridRatio(frame) {
  const g = gcd(frame.w, frame.h);
  return { a: frame.w / g, b: frame.h / g };
}

// Square-tile grid: picks the smallest whole multiple of the frame's reduced
// aspect ratio that has at least `count` cells, so every tile is the same
// size (width === height) and the grid still tiles the frame exactly.
export function computeSquareGrid(count, containerW, frame) {
  const { a, b } = getGridRatio(frame);
  const unit = a * b;
  let m = Math.max(1, Math.ceil(Math.sqrt(Math.max(count, 1) / unit)));
  while (m * m * unit < count) m++;
  const cols = m * a;
  const rows = m * b;
  const tileSize = containerW / cols; // equals containerH / rows exactly, since cols:rows === containerW:containerH
  return { cols, rows, tileSize, capacity: cols * rows };
}

export function computeLayout(count, containerW, frame) {
  const grid = computeSquareGrid(count, containerW, frame);
  const positions = [];
  for (let i = 0; i < count; i++) {
    const col = i % grid.cols;
    const row = Math.floor(i / grid.cols);
    positions.push({ x: col * grid.tileSize, y: row * grid.tileSize, width: grid.tileSize, height: grid.tileSize });
  }
  return positions;
}

// How many albums to auto-fetch so the grid comes out both square-tiled and full (no empty cells).
export function desiredFetchCount(containerW, frame) {
  if (frame.tileCount) return frame.tileCount;
  const { a, b } = getGridRatio(frame);
  const m = Math.max(1, Math.round(containerW / (a * TARGET_TILE_SIZE)));
  return m * a * m * b;
}
