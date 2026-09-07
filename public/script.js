const CONTAINER_MAX = 480; // on-screen px for the longer side of the collage
const TILE_SIZE = 90;      // fixed on-screen tile size (px)
const DOWNLOAD_SCALE = 6;  // export resolution multiplier, keeps tiles near native album-art resolution

const HEART_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='M50 88C20 65 0 45 0 25C0 10 12 0 25 0C35 0 45 6 50 15C55 6 65 0 75 0C88 0 100 10 100 25C100 45 80 65 50 88Z' fill='white'/></svg>`;
const HEART_MASK_URL = `url("data:image/svg+xml,${encodeURIComponent(HEART_SVG)}")`;

const FRAME_PRESETS = {
  'poster:11x17': { w: 11, h: 17, clip: 'none', canvasShape: 'rect' },
  'poster:16x20': { w: 16, h: 20, clip: 'none', canvasShape: 'rect' },
  'poster:18x24': { w: 18, h: 24, clip: 'none', canvasShape: 'rect' },
  'poster:24x36': { w: 24, h: 36, clip: 'none', canvasShape: 'rect' },
  'shape:square': { w: 1, h: 1, clip: 'none', canvasShape: 'rect' },
  'shape:circle': { w: 1, h: 1, clip: 'circle(50% at 50% 50%)', canvasShape: 'circle' },
  'shape:triangle': { w: 1, h: 1, clip: 'polygon(50% 0%, 100% 100%, 0% 100%)', canvasShape: 'triangle' },
  'shape:heart': { w: 1, h: 1, clip: 'none', mask: HEART_MASK_URL, canvasShape: 'heart' }
};

let currentFrameKey = 'poster:18x24';
let currentFrame = FRAME_PRESETS[currentFrameKey];
let arrangement = []; // { uid, image, name, x, y }
let dragOffset = { x: 0, y: 0 };

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

function updatePresetButtons() {
  document.querySelectorAll('[data-frame]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.frame === currentFrameKey);
  });
}

function applyFrame(frameKey) {
  const oldSize = computeContainerSize(currentFrame);
  currentFrame = FRAME_PRESETS[frameKey];
  currentFrameKey = frameKey;
  const newSize = computeContainerSize(currentFrame);

  const container = document.getElementById('collage');
  container.style.width = `${newSize.width}px`;
  container.style.height = `${newSize.height}px`;
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

  if (oldSize.width > 0 && oldSize.height > 0) {
    arrangement.forEach(t => {
      t.x = t.x * (newSize.width / oldSize.width);
      t.y = t.y * (newSize.height / oldSize.height);
    });
  }

  renderCollage();
  updatePresetButtons();
}

function renderCollage() {
  const container = document.getElementById('collage');
  container.innerHTML = '';

  arrangement.forEach(tile => {
    const div = document.createElement('div');
    div.className = 'tile';
    div.style.left = `${tile.x}px`;
    div.style.top = `${tile.y}px`;
    div.style.width = `${TILE_SIZE}px`;
    div.style.height = `${TILE_SIZE}px`;
    div.draggable = true;
    div.dataset.uid = tile.uid;

    const img = document.createElement('img');
    img.src = tile.image || '';
    img.alt = tile.name || '';
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
      dragOffset = { x: e.offsetX, y: e.offsetY };
      e.dataTransfer.setData('application/x-tile-uid', tile.uid);
      e.dataTransfer.effectAllowed = 'move';
      div.classList.add('dragging');
    });
    div.addEventListener('dragend', () => div.classList.remove('dragging'));

    container.appendChild(div);
  });
}

function clampToContainer(x, y, rect) {
  return {
    x: Math.max(0, Math.min(x, rect.width - TILE_SIZE)),
    y: Math.max(0, Math.min(y, rect.height - TILE_SIZE))
  };
}

function setupCollageDropTarget() {
  const collageEl = document.getElementById('collage');
  collageEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });
  collageEl.addEventListener('drop', (e) => {
    e.preventDefault();
    const rect = collageEl.getBoundingClientRect();

    const existingUid = e.dataTransfer.getData('application/x-tile-uid');
    if (existingUid) {
      const tile = arrangement.find(t => t.uid === existingUid);
      if (tile) {
        const pos = clampToContainer(e.clientX - rect.left - dragOffset.x, e.clientY - rect.top - dragOffset.y, rect);
        tile.x = pos.x;
        tile.y = pos.y;
        renderCollage();
      }
      return;
    }

    const newTrackRaw = e.dataTransfer.getData('application/x-new-track');
    if (newTrackRaw) {
      const info = JSON.parse(newTrackRaw);
      const pos = clampToContainer(e.clientX - rect.left - TILE_SIZE / 2, e.clientY - rect.top - TILE_SIZE / 2, rect);
      arrangement.push({ uid: uid(), image: info.image, name: info.name, x: pos.x, y: pos.y });
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

  try {
    const images = await Promise.all(arrangement.map(t => (t.image ? loadImage(t.image) : null)));
    images.forEach((img, i) => {
      if (!img) return;
      const t = arrangement[i];
      ctx.drawImage(img, t.x * DOWNLOAD_SCALE, t.y * DOWNLOAD_SCALE, TILE_SIZE * DOWNLOAD_SCALE, TILE_SIZE * DOWNLOAD_SCALE);
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
  const container = document.getElementById('collage');
  const size = computeContainerSize(currentFrame);
  const cols = Math.max(1, Math.floor(size.width / TILE_SIZE));
  const rows = Math.max(1, Math.floor(size.height / TILE_SIZE));
  const needed = cols * rows;

  const albums = await fetchAlbums(needed);
  if (!albums) {
    alert('Not logged in. Click "Login with Spotify" first.');
    return;
  }
  arrangement = albums.slice(0, needed).map((a, i) => ({
    uid: uid(),
    image: a.image,
    name: a.name,
    x: (i % cols) * TILE_SIZE,
    y: Math.floor(i / cols) * TILE_SIZE
  }));
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
    renderCollage();
    await updateLoginUI();
  });
  document.getElementById('refresh').addEventListener('click', loadTopTracks);
  document.getElementById('scratch').addEventListener('click', () => {
    arrangement = [];
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
  applyFrame(currentFrameKey);

  const loggedIn = await updateLoginUI();
  if (loggedIn) {
    await loadTopTracks();
  }
}

window.addEventListener('DOMContentLoaded', init);
