const CONTAINER_MAX = 480;    // on-screen px for the longer side of the collage
const TARGET_TILE_SIZE = 90;  // soft target used only to pick how many tracks to auto-fetch
const DOWNLOAD_SCALE = 6;     // export resolution multiplier, keeps tiles near native album-art resolution

const HEART_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='M50 88C20 65 0 45 0 25C0 10 12 0 25 0C35 0 45 6 50 15C55 6 65 0 75 0C88 0 100 10 100 25C100 45 80 65 50 88Z' fill='white'/></svg>`;
const HEART_MASK_URL = `url("data:image/svg+xml,${encodeURIComponent(HEART_SVG)}")`;

const FRAME_PRESETS = {
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

let currentFrameKey = 'poster:18x24';
let currentFrame = FRAME_PRESETS[currentFrameKey];
let arrangement = []; // { uid, image, name } — order maps onto the justified grid, left-to-right, top-to-bottom
let usingTopTracks = false; // true when arrangement was auto-filled from Spotify top tracks (vs. manually built)

function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
}

async function isLoggedIn() {
  const resp = await fetch('/api/session');
  const data = await resp.json();
  return !!data.loggedIn;
}

async function fetchAlbums(limit) {
  const resp = await fetch(`/api/top?limit=${limit}`);
  if (resp.status === 401) return null;
  if (!resp.ok) throw new Error('Failed to fetch');
  const data = await resp.json();
  return data.albums || [];
}

function computeContainerSize(frame) {
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
function getGridRatio(frame) {
  const g = gcd(frame.w, frame.h);
  return { a: frame.w / g, b: frame.h / g };
}

// Square-tile grid: picks the smallest whole multiple of the frame's reduced
// aspect ratio that has at least `count` cells, so every tile is the same
// size (width === height) and the grid still tiles the frame exactly.
function computeSquareGrid(count, containerW, containerH, frame) {
  const { a, b } = getGridRatio(frame);
  const unit = a * b;
  let m = Math.max(1, Math.ceil(Math.sqrt(Math.max(count, 1) / unit)));
  while (m * m * unit < count) m++;
  const cols = m * a;
  const rows = m * b;
  const tileSize = containerW / cols; // equals containerH / rows exactly, since cols:rows === containerW:containerH
  return { cols, rows, tileSize, capacity: cols * rows };
}

function computeLayout(count, containerW, containerH, frame) {
  const grid = computeSquareGrid(count, containerW, containerH, frame);
  const positions = [];
  for (let i = 0; i < count; i++) {
    const col = i % grid.cols;
    const row = Math.floor(i / grid.cols);
    positions.push({ x: col * grid.tileSize, y: row * grid.tileSize, width: grid.tileSize, height: grid.tileSize });
  }
  return positions;
}

// How many albums to auto-fetch so the grid comes out both square-tiled and full (no empty cells).
function desiredFetchCount(containerW, frame) {
  if (frame.tileCount) return frame.tileCount;
  const { a, b } = getGridRatio(frame);
  const m = Math.max(1, Math.round(containerW / (a * TARGET_TILE_SIZE)));
  return m * a * m * b;
}

function updatePresetButtons() {
  document.querySelectorAll('[data-frame]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.frame === currentFrameKey);
  });
}

async function applyFrame(frameKey) {
  currentFrame = FRAME_PRESETS[frameKey];
  currentFrameKey = frameKey;
  const size = computeContainerSize(currentFrame);

  const container = document.getElementById('collage');
  container.style.width = `${size.width}px`;
  container.style.height = `${size.height}px`;
  container.style.clipPath = currentFrame.clip || 'none';
  if (currentFrame.mask) {
    container.style.webkitMaskImage = currentFrame.mask;
    container.style.maskImage = currentFrame.mask;
    container.style.webkitMaskSize = '100% 100%';
    container.style.maskSize = '100% 100%';
    container.style.webkitMaskRepeat = 'no-repeat';
    container.style.maskRepeat = 'no-repeat';
  } else {
    container.style.webkitMaskImage = 'none';
    container.style.maskImage = 'none';
  }

  updatePresetButtons();

  if (usingTopTracks) {
    // Re-pull the right number of top tracks for this frame's target tile count.
    await loadTopTracks();
  } else {
    // Manually built collage: keep every existing pick, but pad or trim to this frame's target count.
    const targetCount = desiredFetchCount(size.width, currentFrame);
    await padOrTrimArrangement(targetCount);
    renderCollage();
  }
}

// Keeps all existing tiles, adding more top tracks (skipping ones already on the collage)
// or trimming extras from the end, so the count matches `targetCount` exactly when possible.
async function padOrTrimArrangement(targetCount) {
  if (arrangement.length === targetCount) return;
  if (arrangement.length > targetCount) {
    arrangement = arrangement.slice(0, targetCount);
    return;
  }
  const extra = targetCount - arrangement.length;
  const existingImages = new Set(arrangement.map(t => t.image));
  const albums = await fetchAlbums(targetCount + arrangement.length);
  if (!albums) return; // not logged in — leave the collage short rather than fail
  const fresh = albums.filter(a => !existingImages.has(a.image)).slice(0, extra);
  fresh.forEach(a => arrangement.push({ uid: uid(), image: a.image, name: a.name }));
}

function renderCollage() {
  const container = document.getElementById('collage');
  container.innerHTML = '';

  const size = computeContainerSize(currentFrame);
  const positions = computeLayout(arrangement.length, size.width, size.height, currentFrame);

  arrangement.forEach((tile, i) => {
    const pos = positions[i];
    const div = document.createElement('div');
    div.className = 'tile';
    div.style.left = `${pos.x}px`;
    div.style.top = `${pos.y}px`;
    div.style.width = `${pos.width}px`;
    div.style.height = `${pos.height}px`;
    div.draggable = true;
    div.dataset.uid = tile.uid;

    const img = document.createElement('img');
    img.src = tile.image || '';
    img.alt = tile.name || '';
    img.draggable = false; // let the parent .tile div's dragstart handle it, not the browser's native image drag
    div.appendChild(img);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '×';
    removeBtn.draggable = false;
    removeBtn.title = 'Remove';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      arrangement = arrangement.filter(t => t.uid !== tile.uid);
      renderCollage();
    });
    removeBtn.addEventListener('dragstart', (e) => { e.preventDefault(); e.stopPropagation(); });
    div.appendChild(removeBtn);

    div.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/x-tile-uid', tile.uid);
      e.dataTransfer.effectAllowed = 'move';
      div.classList.add('dragging');
    });
    div.addEventListener('dragend', () => div.classList.remove('dragging'));

    container.appendChild(div);
  });
}

function setupCollageDropTarget() {
  const collageEl = document.getElementById('collage');
  collageEl.addEventListener('dragenter', (e) => { e.preventDefault(); });
  collageEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    // dropEffect must match the drag source's effectAllowed or some browsers refuse the drop entirely.
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/x-new-track') ? 'copy' : 'move';
  });
  collageEl.addEventListener('drop', (e) => {
    e.preventDefault();

    const targetTileDiv = document.elementFromPoint(e.clientX, e.clientY)?.closest('.tile') || null;
    const targetUid = targetTileDiv ? targetTileDiv.dataset.uid : null;
    const targetIndex = targetUid ? arrangement.findIndex(t => t.uid === targetUid) : -1;

    const existingUid = e.dataTransfer.getData('application/x-tile-uid');
    if (existingUid) {
      const fromIndex = arrangement.findIndex(t => t.uid === existingUid);
      if (fromIndex === -1 || targetIndex === -1 || targetIndex === fromIndex) return;
      // Swap the two tiles' contents — positions stay part of the same clean grid.
      [arrangement[fromIndex], arrangement[targetIndex]] = [arrangement[targetIndex], arrangement[fromIndex]];
      renderCollage();
      return;
    }

    const newTrackRaw = e.dataTransfer.getData('application/x-new-track');
    if (newTrackRaw) {
      const info = JSON.parse(newTrackRaw);
      const newTile = { uid: uid(), image: info.image, name: info.name };
      if (targetIndex === -1) arrangement.push(newTile);
      else arrangement.splice(targetIndex, 0, newTile);
      usingTopTracks = false;
      renderCollage();
    }
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function applyCanvasClip(ctx, frame, w, h) {
  const shape = frame.canvasShape || 'rect';
  ctx.beginPath();
  if (shape === 'circle') {
    ctx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
  } else if (shape === 'triangle') {
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
  } else if (shape === 'heart') {
    const topCurveHeight = h * 0.3;
    ctx.moveTo(w / 2, topCurveHeight);
    ctx.bezierCurveTo(w / 2, topCurveHeight - h * 0.3, 0, topCurveHeight - h * 0.3, 0, topCurveHeight);
    ctx.bezierCurveTo(0, h * 0.6, w / 2, h * 0.9, w / 2, h);
    ctx.bezierCurveTo(w / 2, h * 0.9, w, h * 0.6, w, topCurveHeight);
    ctx.bezierCurveTo(w, topCurveHeight - h * 0.3, w / 2, topCurveHeight - h * 0.3, w / 2, topCurveHeight);
    ctx.closePath();
  } else {
    ctx.rect(0, 0, w, h);
  }
  ctx.clip();
}

async function downloadCollage() {
  if (!arrangement.length) {
    alert('Add some album covers to the collage first.');
    return;
  }
  const size = computeContainerSize(currentFrame);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(size.width * DOWNLOAD_SCALE);
  canvas.height = Math.round(size.height * DOWNLOAD_SCALE);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  applyCanvasClip(ctx, currentFrame, canvas.width, canvas.height);

  // Compute the grid directly at export resolution so tiles line up pixel-perfectly, edge to edge.
  const positions = computeLayout(arrangement.length, canvas.width, canvas.height, currentFrame);

  try {
    const images = await Promise.all(arrangement.map(t => (t.image ? loadImage(t.image) : null)));
    images.forEach((img, i) => {
      if (!img) return;
      const pos = positions[i];
      ctx.drawImage(img, pos.x, pos.y, pos.width, pos.height);
    });

    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'album-collage.png';
      link.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  } catch (err) {
    console.error(err);
    alert('Failed to export collage image (album art failed to load for export).');
  }
}

async function loadTopTracks() {
  const size = computeContainerSize(currentFrame);
  const needed = desiredFetchCount(size.width, currentFrame);

  const albums = await fetchAlbums(needed);
  if (!albums) {
    alert('Not logged in. Click "Login with Spotify" first.');
    return;
  }
  if (albums.length < needed) {
    console.warn(`Only found ${albums.length} unique top albums; requested ${needed} for an exact square-tile fill.`);
  }
  arrangement = albums.slice(0, needed).map(a => ({ uid: uid(), image: a.image, name: a.name }));
  usingTopTracks = true;
  renderCollage();
}

async function searchSongs() {
  const q = document.getElementById('song-search').value.trim();
  const resultsEl = document.getElementById('search-results');
  if (!q) {
    resultsEl.hidden = true;
    resultsEl.innerHTML = '';
    return;
  }
  try {
    const resp = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    if (resp.status === 401) {
      alert('Log in with Spotify to search for songs.');
      return;
    }
    if (!resp.ok) throw new Error('Search failed');
    const data = await resp.json();
    renderSearchResults(data.tracks || []);
  } catch (err) {
    console.error(err);
    alert('Search failed. Check console.');
  }
}

function renderSearchResults(tracks) {
  const resultsEl = document.getElementById('search-results');
  resultsEl.innerHTML = '';
  resultsEl.hidden = tracks.length === 0;
  tracks.forEach(t => {
    const item = document.createElement('div');
    item.className = 'search-result';
    item.draggable = true;

    const img = document.createElement('img');
    img.src = t.image || '';
    img.alt = t.name;
    img.draggable = false; // let the parent .search-result div's dragstart handle it, not the browser's native image drag

    const label = document.createElement('span');
    label.textContent = `${t.name} — ${t.artist}`;

    item.appendChild(img);
    item.appendChild(label);

    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/x-new-track', JSON.stringify({ image: t.image, name: t.name }));
      e.dataTransfer.effectAllowed = 'copy';
    });

    resultsEl.appendChild(item);
  });
}

async function updateLoginUI() {
  const loggedIn = await isLoggedIn();
  document.getElementById('login').hidden = loggedIn;
  document.getElementById('logout').hidden = !loggedIn;
  return loggedIn;
}

async function init() {
  document.getElementById('login').addEventListener('click', () => { window.location = '/login'; });
  document.getElementById('logout').addEventListener('click', async () => {
    await fetch('/logout', { method: 'POST' });
    arrangement = [];
    usingTopTracks = false;
    renderCollage();
    await updateLoginUI();
  });
  document.getElementById('refresh').addEventListener('click', loadTopTracks);
  document.getElementById('scratch').addEventListener('click', () => {
    arrangement = [];
    usingTopTracks = false;
    renderCollage();
  });
  document.getElementById('download').addEventListener('click', downloadCollage);

  document.querySelectorAll('[data-frame]').forEach(btn => {
    btn.addEventListener('click', () => applyFrame(btn.dataset.frame));
  });

  document.getElementById('search-btn').addEventListener('click', searchSongs);
  document.getElementById('song-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchSongs();
  });

  setupCollageDropTarget();
  await applyFrame(currentFrameKey); // sizes/clips the container; no-op refetch since usingTopTracks is still false here

  const loggedIn = await updateLoginUI();
  if (loggedIn) {
    await loadTopTracks();
  }
}

window.addEventListener('DOMContentLoaded', init);
