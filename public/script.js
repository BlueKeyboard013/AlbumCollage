const GRID_GAP = 6; // must match --gap in styles.css

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

function getGridConfig() {
  const shape = document.getElementById('shape').value;
  const tileSize = parseInt(document.getElementById('tile-size').value, 10);
  if (shape === 'square') {
    const size = parseInt(document.getElementById('square-size').value, 10);
    return { cols: size, rows: size, tileSize };
  }
  const cols = parseInt(document.getElementById('rect-cols').value, 10);
  const rows = parseInt(document.getElementById('rect-rows').value, 10);
  return { cols, rows, tileSize };
}

function renderCollage(albums, gridConfig) {
  const { cols, rows, tileSize } = gridConfig;
  const container = document.getElementById('collage');
  container.innerHTML = '';
  container.style.gridTemplateColumns = `repeat(${cols}, ${tileSize}px)`;
  container.style.gridAutoRows = `${tileSize}px`;

  const needed = cols * rows;
  const slice = albums.slice(0, needed);
  for (const a of slice) {
    const img = document.createElement('img');
    img.src = a.image || '';
    img.alt = a.name || '';
    container.appendChild(img);
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

async function downloadCollage() {
  if (!cachedAlbums || !cachedAlbums.length) {
    alert('Load a collage first.');
    return;
  }
  const gridConfig = getGridConfig();
  const { cols, rows, tileSize } = gridConfig;
  const slice = cachedAlbums.slice(0, cols * rows);

  const canvas = document.createElement('canvas');
  canvas.width = cols * tileSize + (cols - 1) * GRID_GAP;
  canvas.height = rows * tileSize + (rows - 1) * GRID_GAP;
  const ctx = canvas.getContext('2d');

  try {
    const images = await Promise.all(slice.map(a => a.image ? loadImage(a.image) : null));
    images.forEach((img, i) => {
      if (!img) return;
      const x = (i % cols) * (tileSize + GRID_GAP);
      const y = Math.floor(i / cols) * (tileSize + GRID_GAP);
      ctx.drawImage(img, x, y, tileSize, tileSize);
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

function updateShapeControls() {
  const shape = document.getElementById('shape').value;
  const isSquare = shape === 'square';
  document.getElementById('square-size-label').hidden = !isSquare;
  document.getElementById('rect-cols-label').hidden = isSquare;
  document.getElementById('rect-rows-label').hidden = isSquare;
}

let cachedAlbums = null;

async function loadAndRender() {
  try {
    const gridConfig = getGridConfig();
    const needed = gridConfig.cols * gridConfig.rows;
    if (!cachedAlbums || cachedAlbums.length < needed) {
      const albums = await fetchAlbums(needed);
      if (!albums) {
        alert('Not logged in. Click "Login with Spotify" first.');
        return;
      }
      cachedAlbums = albums;
    }
    renderCollage(cachedAlbums, gridConfig);
  } catch (err) {
    console.error(err);
    alert('Failed to load albums. Check console.');
  }
}

async function updateLoginUI() {
  const loggedIn = await isLoggedIn();
  document.getElementById('login').hidden = loggedIn;
  document.getElementById('logout').hidden = !loggedIn;
  return loggedIn;
}

async function init() {
  const loginBtn = document.getElementById('login');
  const logoutBtn = document.getElementById('logout');
  const refreshBtn = document.getElementById('refresh');
  const downloadBtn = document.getElementById('download');
  const shapeSelect = document.getElementById('shape');
  const squareSize = document.getElementById('square-size');
  const rectCols = document.getElementById('rect-cols');
  const rectRows = document.getElementById('rect-rows');
  const tileSize = document.getElementById('tile-size');

  loginBtn.addEventListener('click', () => { window.location = '/login'; });
  logoutBtn.addEventListener('click', async () => {
    await fetch('/logout', { method: 'POST' });
    cachedAlbums = null;
    document.getElementById('collage').innerHTML = '';
    await updateLoginUI();
  });
  refreshBtn.addEventListener('click', () => { cachedAlbums = null; loadAndRender(); });
  downloadBtn.addEventListener('click', downloadCollage);

  shapeSelect.addEventListener('change', () => { updateShapeControls(); loadAndRender(); });
  squareSize.addEventListener('change', loadAndRender);
  rectCols.addEventListener('change', loadAndRender);
  rectRows.addEventListener('change', loadAndRender);
  tileSize.addEventListener('input', () => {
    if (cachedAlbums) renderCollage(cachedAlbums, getGridConfig());
  });

  updateShapeControls();

  const loggedIn = await updateLoginUI();
  if (loggedIn) {
    await loadAndRender();
  }
}

window.addEventListener('DOMContentLoaded', init);
