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

const MIN_PLAYGROUND_TILE = 30; // smallest a tile can be resized to in Playground mode

let currentFrameKey = 'poster:18x24';
let currentFrame = FRAME_PRESETS[currentFrameKey];
let currentTimeRange = 'medium_term';
let arrangement = []; // { uid, image, name } — order maps onto the justified grid, left-to-right, top-to-bottom
let usingTopTracks = false; // true when arrangement was auto-filled from Spotify top tracks (vs. manually built)

let activeTab = 'auto'; // 'auto' | 'playground'
let playgroundArrangement = []; // { uid, image, name, x, y, width, height } — free position/size, independent per tile
let playgroundInitialized = false;

let loggedIn = false; // logged-out visitors still get a working collage, seeded from a public top-50 playlist

function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
}

async function isLoggedIn() {
  const resp = await fetch('/api/session');
  const data = await resp.json();
  return !!data.loggedIn;
}

async function fetchAlbums(limit) {
  const url = loggedIn
    ? `/api/top?limit=${limit}&time_range=${currentTimeRange}`
    : `/api/public/top?limit=${limit}`;
  const resp = await fetch(url);
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
function computeSquareGrid(count, containerW, frame) {
  const { a, b } = getGridRatio(frame);
  const unit = a * b;
  let m = Math.max(1, Math.ceil(Math.sqrt(Math.max(count, 1) / unit)));
  while (m * m * unit < count) m++;
  const cols = m * a;
  const rows = m * b;
  const tileSize = containerW / cols; // equals containerH / rows exactly, since cols:rows === containerW:containerH
  return { cols, rows, tileSize, capacity: cols * rows };
}

function computeLayout(count, containerW, frame) {
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

function applyFrameStyle(container, frame, size) {
  container.style.width = `${size.width}px`;
  container.style.height = `${size.height}px`;
  container.style.clipPath = frame.clip || 'none';
  if (frame.mask) {
    container.style.webkitMaskImage = frame.mask;
    container.style.maskImage = frame.mask;
    container.style.webkitMaskSize = '100% 100%';
    container.style.maskSize = '100% 100%';
    container.style.webkitMaskRepeat = 'no-repeat';
    container.style.maskRepeat = 'no-repeat';
  } else {
    container.style.webkitMaskImage = 'none';
    container.style.maskImage = 'none';
  }
}

async function applyFrame(frameKey) {
  const oldSize = computeContainerSize(currentFrame);
  currentFrame = FRAME_PRESETS[frameKey];
  currentFrameKey = frameKey;
  const size = computeContainerSize(currentFrame);

  applyFrameStyle(document.getElementById('collage'), currentFrame, size);
  applyFrameStyle(document.getElementById('collage-playground'), currentFrame, size);

  if (playgroundInitialized && oldSize.width > 0 && oldSize.height > 0) {
    const scaleX = size.width / oldSize.width;
    const scaleY = size.height / oldSize.height;
    playgroundArrangement.forEach(t => {
      t.x *= scaleX; t.y *= scaleY; t.width *= scaleX; t.height *= scaleY;
    });
    renderPlayground();
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
  const positions = computeLayout(arrangement.length, size.width, currentFrame);

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

// ---- Playground: free positioning + independent per-tile resizing ----
// No on-tile buttons here — clicking or dragging a tile only selects it, and the side
// panel (#playground-panel) acts on whichever tile is currently selected. That sidesteps
// the earlier problem entirely: a covered tile's controls can never become unreachable,
// because they're never rendered on the tile in the first place.

const PLAYGROUND_SIZE_STEP = 10;
let selectedPlaygroundUid = null;

function initPlaygroundFromAutomated() {
  const size = computeContainerSize(currentFrame);
  const positions = computeLayout(arrangement.length, size.width, currentFrame);
  playgroundArrangement = arrangement.map((tile, i) => ({
    uid: uid(),
    image: tile.image,
    name: tile.name,
    x: positions[i].x,
    y: positions[i].y,
    width: positions[i].width,
    height: positions[i].height,
    z: i
  }));
  playgroundInitialized = true;
  selectedPlaygroundUid = null;
  renderPlayground();
  updatePlaygroundPanel();
}

function bringTileToFront(tile) {
  const maxZ = Math.max(0, ...playgroundArrangement.map(t => t.z || 0));
  tile.z = maxZ + 1;
}

function sendTileToBack(tile) {
  const minZ = Math.min(0, ...playgroundArrangement.map(t => t.z || 0));
  tile.z = minZ - 1;
}

function getSelectedPlaygroundTile() {
  return playgroundArrangement.find(t => t.uid === selectedPlaygroundUid) || null;
}

// Lightweight selection update used during click/drag-start: just toggles the 'selected'
// class and refreshes the panel, without a full re-render that would disrupt an in-progress drag.
function selectPlaygroundTile(tileUid) {
  selectedPlaygroundUid = tileUid;
  document.querySelectorAll('#collage-playground .tile.selected').forEach(el => el.classList.remove('selected'));
  if (tileUid) {
    const el = document.querySelector(`#collage-playground .tile[data-uid="${tileUid}"]`);
    if (el) el.classList.add('selected');
  }
  updatePlaygroundPanel();
}

function updatePlaygroundPanel() {
  const tile = getSelectedPlaygroundTile();
  document.getElementById('panel-empty').hidden = !!tile;
  document.getElementById('panel-controls').hidden = !tile;
}

function renderPlayground() {
  const container = document.getElementById('collage-playground');
  container.innerHTML = '';

  playgroundArrangement.forEach(tile => {
    const div = document.createElement('div');
    div.className = 'tile playground-tile' + (tile.uid === selectedPlaygroundUid ? ' selected' : '');
    div.style.left = `${tile.x}px`;
    div.style.top = `${tile.y}px`;
    div.style.width = `${tile.width}px`;
    div.style.height = `${tile.height}px`;
    div.style.zIndex = String(tile.z || 0);
    div.dataset.uid = tile.uid;

    const img = document.createElement('img');
    img.src = tile.image || '';
    img.alt = tile.name || '';
    img.draggable = false;
    div.appendChild(img);

    div.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      selectPlaygroundTile(tile.uid);

      const containerRect = container.getBoundingClientRect();
      const startClientX = e.clientX, startClientY = e.clientY;
      const startLeft = tile.x, startTop = tile.y;
      div.setPointerCapture(e.pointerId);
      div.classList.add('dragging');

      const onMove = (ev) => {
        const dx = ev.clientX - startClientX, dy = ev.clientY - startClientY;
        const newX = Math.max(0, Math.min(startLeft + dx, containerRect.width - tile.width));
        const newY = Math.max(0, Math.min(startTop + dy, containerRect.height - tile.height));
        tile.x = newX; tile.y = newY;
        div.style.left = `${newX}px`;
        div.style.top = `${newY}px`;
      };
      const onUp = () => {
        div.classList.remove('dragging');
        div.removeEventListener('pointermove', onMove);
        div.removeEventListener('pointerup', onUp);
      };
      div.addEventListener('pointermove', onMove);
      div.addEventListener('pointerup', onUp);
    });

    container.appendChild(div);
  });
}

function setupPlaygroundDropTarget() {
  const el = document.getElementById('collage-playground');
  el.addEventListener('dragenter', (e) => { e.preventDefault(); });
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    const newTrackRaw = e.dataTransfer.getData('application/x-new-track');
    if (!newTrackRaw) return;
    const info = JSON.parse(newTrackRaw);
    const rect = el.getBoundingClientRect();
    const size = TARGET_TILE_SIZE;
    const x = Math.max(0, Math.min(e.clientX - rect.left - size / 2, rect.width - size));
    const y = Math.max(0, Math.min(e.clientY - rect.top - size / 2, rect.height - size));
    const maxZ = Math.max(0, ...playgroundArrangement.map(t => t.z || 0));
    const newTile = { uid: uid(), image: info.image, name: info.name, x, y, width: size, height: size, z: maxZ + 1 };
    playgroundArrangement.push(newTile);
    selectedPlaygroundUid = newTile.uid;
    renderPlayground();
    updatePlaygroundPanel();
  });
}

function setupPlaygroundPanel() {
  document.getElementById('panel-front').addEventListener('click', () => {
    const tile = getSelectedPlaygroundTile();
    if (!tile) return;
    bringTileToFront(tile);
    renderPlayground();
  });

  document.getElementById('panel-back').addEventListener('click', () => {
    const tile = getSelectedPlaygroundTile();
    if (!tile) return;
    sendTileToBack(tile);
    renderPlayground();
  });

  document.getElementById('panel-size-inc').addEventListener('click', () => {
    const tile = getSelectedPlaygroundTile();
    if (!tile) return;
    const size = computeContainerSize(currentFrame);
    tile.width = Math.min(size.width - tile.x, tile.width + PLAYGROUND_SIZE_STEP);
    tile.height = Math.min(size.height - tile.y, tile.height + PLAYGROUND_SIZE_STEP);
    renderPlayground();
  });

  document.getElementById('panel-size-dec').addEventListener('click', () => {
    const tile = getSelectedPlaygroundTile();
    if (!tile) return;
    tile.width = Math.max(MIN_PLAYGROUND_TILE, tile.width - PLAYGROUND_SIZE_STEP);
    tile.height = Math.max(MIN_PLAYGROUND_TILE, tile.height - PLAYGROUND_SIZE_STEP);
    renderPlayground();
  });

  document.getElementById('panel-remove').addEventListener('click', () => {
    if (!selectedPlaygroundUid) return;
    playgroundArrangement = playgroundArrangement.filter(t => t.uid !== selectedPlaygroundUid);
    selectedPlaygroundUid = null;
    renderPlayground();
    updatePlaygroundPanel();
  });
}

function setActiveTab(tab) {
  activeTab = tab;
  document.getElementById('tab-auto').classList.toggle('active', tab === 'auto');
  document.getElementById('tab-playground').classList.toggle('active', tab === 'playground');
  document.getElementById('collage').hidden = tab !== 'auto';
  document.getElementById('playground-wrap').hidden = tab !== 'playground';
  document.getElementById('playground-reset').hidden = tab !== 'playground';

  if (tab === 'playground' && !playgroundInitialized) {
    initPlaygroundFromAutomated();
  }
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
  // Playground tiles must be drawn in the same back-to-front stacking order shown on screen.
  const list = activeTab === 'playground'
    ? [...playgroundArrangement].sort((a, b) => (a.z || 0) - (b.z || 0))
    : arrangement;
  if (!list.length) {
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

  // Automated: recompute the exact grid at export resolution. Playground: scale each tile's own free position/size.
  const positions = activeTab === 'playground'
    ? list.map(t => ({ x: t.x * DOWNLOAD_SCALE, y: t.y * DOWNLOAD_SCALE, width: t.width * DOWNLOAD_SCALE, height: t.height * DOWNLOAD_SCALE }))
    : computeLayout(arrangement.length, canvas.width, currentFrame);

  try {
    const images = await Promise.all(list.map(t => (t.image ? loadImage(t.image) : null)));
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
    alert('Failed to load top tracks. Please try again.');
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
    const url = loggedIn ? `/api/search?q=${encodeURIComponent(q)}` : `/api/public/search?q=${encodeURIComponent(q)}`;
    const resp = await fetch(url);
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
  loggedIn = await isLoggedIn();
  document.getElementById('login').hidden = loggedIn;
  document.getElementById('logout').hidden = !loggedIn;
  document.getElementById('time-range-group').hidden = !loggedIn;
  return loggedIn;
}

async function init() {
  document.getElementById('login').addEventListener('click', () => { window.location = '/login'; });
  document.getElementById('logout').addEventListener('click', async () => {
    await fetch('/logout', { method: 'POST' });
    arrangement = [];
    usingTopTracks = false;
    playgroundArrangement = [];
    playgroundInitialized = false;
    selectedPlaygroundUid = null;
    renderPlayground();
    updatePlaygroundPanel();
    await updateLoginUI();
    await loadTopTracks(); // falls back to the public global top-50 now that we're logged out
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

  document.getElementById('time-range').addEventListener('change', (e) => {
    currentTimeRange = e.target.value;
    loadTopTracks();
  });

  document.getElementById('search-btn').addEventListener('click', searchSongs);
  document.getElementById('song-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchSongs();
  });

  document.getElementById('tab-auto').addEventListener('click', () => setActiveTab('auto'));
  document.getElementById('tab-playground').addEventListener('click', () => setActiveTab('playground'));
  document.getElementById('playground-reset').addEventListener('click', initPlaygroundFromAutomated);

  setupCollageDropTarget();
  setupPlaygroundDropTarget();
  setupPlaygroundPanel();
  await applyFrame(currentFrameKey); // sizes/clips the container; no-op refetch since usingTopTracks is still false here

  await updateLoginUI();
  await loadTopTracks(); // seeds from the user's own top tracks if logged in, otherwise the public global top-50
}

window.addEventListener('DOMContentLoaded', init);
