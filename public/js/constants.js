// Fixed configuration values used across the app. Nothing here changes at runtime.

export const CONTAINER_MAX = 480;    // on-screen px for the longer side of the collage
export const TARGET_TILE_SIZE = 90;  // soft target used only to pick how many tracks to auto-fetch
export const DOWNLOAD_SCALE = 6;     // export resolution multiplier, keeps tiles near native album-art resolution
export const MIN_PLAYGROUND_TILE = 30; // smallest a tile can be resized to in Playground mode
export const PLAYGROUND_SIZE_STEP = 10; // px per click of the Playground size +/- buttons

const HEART_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='M50 88C20 65 0 45 0 25C0 10 12 0 25 0C35 0 45 6 50 15C55 6 65 0 75 0C88 0 100 10 100 25C100 45 80 65 50 88Z' fill='white'/></svg>`;
const HEART_MASK_URL = `url("data:image/svg+xml,${encodeURIComponent(HEART_SVG)}")`;

export const FRAME_PRESETS = {
  // tileCount is fixed per poster size so the grid always comes out to that exact count
  // (12/20/24 all reduce cleanly to whole multiples of the poster's aspect ratio, so tiles stay square).
  'poster:11x17': { w: 11, h: 17, clip: 'none', canvasShape: 'rect', tileCount: 187 },
  'poster:16x20': { w: 16, h: 20, clip: 'none', canvasShape: 'rect', tileCount: 20 },
  'poster:18x24': { w: 18, h: 24, clip: 'none', canvasShape: 'rect', tileCount: 12 },
  'poster:24x36': { w: 24, h: 36, clip: 'none', canvasShape: 'rect', tileCount: 24 },
  'shape:square': { w: 1, h: 1, clip: 'none', canvasShape: 'rect' },
  'shape:circle': { w: 1, h: 1, clip: 'circle(50% at 50% 50%)', canvasShape: 'circle' },
  'shape:triangle': { w: 1, h: 1, clip: 'polygon(50% 0%, 100% 100%, 0% 100%)', canvasShape: 'triangle' },
  'shape:heart': { w: 1, h: 1, clip: 'none', mask: HEART_MASK_URL, canvasShape: 'heart' }
};
