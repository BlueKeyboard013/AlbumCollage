// The "Automated" tab: a justified grid of square tiles, auto-filled from top tracks or
// manually curated by dragging in search results. Tiles swap position on drag (no free
// positioning here — that's what Playground mode is for).
import { state } from './state.js';
import { uid } from './util.js';
import { computeContainerSize, computeLayout, desiredFetchCount } from './layout.js';
import { fetchAlbums } from './api.js';

export async function loadTopTracks() {
  const size = computeContainerSize(state.currentFrame);
  const needed = desiredFetchCount(size.width, state.currentFrame);

  const albums = await fetchAlbums(needed);
  if (!albums) {
    alert('Failed to load top tracks. Please try again.');
    return;
  }
  if (albums.length < needed) {
    console.warn(`Only found ${albums.length} unique top albums; requested ${needed} for an exact square-tile fill.`);
  }
  state.arrangement = albums.slice(0, needed).map(a => ({ uid: uid(), image: a.image, name: a.name }));
  state.usingTopTracks = true;
  renderCollage();
}

// Keeps all existing tiles, adding more top tracks (skipping ones already on the collage)
// or trimming extras from the end, so the count matches `targetCount` exactly when possible.
export async function padOrTrimArrangement(targetCount) {
  if (state.arrangement.length === targetCount) return;
  if (state.arrangement.length > targetCount) {
    state.arrangement = state.arrangement.slice(0, targetCount);
    return;
  }
  const extra = targetCount - state.arrangement.length;
  const existingImages = new Set(state.arrangement.map(t => t.image));
  const albums = await fetchAlbums(targetCount + state.arrangement.length);
  if (!albums) return; // fetch failed — leave the collage short rather than fail
  const fresh = albums.filter(a => !existingImages.has(a.image)).slice(0, extra);
  fresh.forEach(a => state.arrangement.push({ uid: uid(), image: a.image, name: a.name }));
}

export function renderCollage() {
  const container = document.getElementById('collage');
  container.innerHTML = '';

  const size = computeContainerSize(state.currentFrame);
  const positions = computeLayout(state.arrangement.length, size.width, state.currentFrame);

  state.arrangement.forEach((tile, i) => {
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
      state.arrangement = state.arrangement.filter(t => t.uid !== tile.uid);
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

export function setupCollageDropTarget() {
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
    const targetIndex = targetUid ? state.arrangement.findIndex(t => t.uid === targetUid) : -1;

    const existingUid = e.dataTransfer.getData('application/x-tile-uid');
    if (existingUid) {
      const fromIndex = state.arrangement.findIndex(t => t.uid === existingUid);
      if (fromIndex === -1 || targetIndex === -1 || targetIndex === fromIndex) return;
      // Swap the two tiles' contents — positions stay part of the same clean grid.
      [state.arrangement[fromIndex], state.arrangement[targetIndex]] = [state.arrangement[targetIndex], state.arrangement[fromIndex]];
      renderCollage();
      return;
    }

    const newTrackRaw = e.dataTransfer.getData('application/x-new-track');
    if (newTrackRaw) {
      const info = JSON.parse(newTrackRaw);
      const newTile = { uid: uid(), image: info.image, name: info.name };
      if (targetIndex === -1) state.arrangement.push(newTile);
      else state.arrangement.splice(targetIndex, 0, newTile);
      state.usingTopTracks = false;
      renderCollage();
    }
  });
}
