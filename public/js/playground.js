// The "Playground" tab: tiles can be dragged anywhere and resized independently of one
// another. No on-tile buttons — clicking or dragging a tile only selects it, and the side
// panel (#playground-panel) acts on whichever tile is currently selected. That sidesteps
// the "controls hidden behind another tile" problem entirely: controls are never rendered
// on the tile itself, so they can never become unreachable.
import { state } from './state.js';
import { uid } from './util.js';
import { computeContainerSize, computeLayout } from './layout.js';
import { TARGET_TILE_SIZE, MIN_PLAYGROUND_TILE, PLAYGROUND_SIZE_STEP } from './constants.js';

export function initPlaygroundFromAutomated() {
  const size = computeContainerSize(state.currentFrame);
  const positions = computeLayout(state.arrangement.length, size.width, state.currentFrame);
  state.playgroundArrangement = state.arrangement.map((tile, i) => ({
    uid: uid(),
    image: tile.image,
    name: tile.name,
    x: positions[i].x,
    y: positions[i].y,
    width: positions[i].width,
    height: positions[i].height,
    z: i
  }));
  state.playgroundInitialized = true;
  state.selectedPlaygroundUid = null;
  renderPlayground();
  updatePlaygroundPanel();
}

export function bringTileToFront(tile) {
  const maxZ = Math.max(0, ...state.playgroundArrangement.map(t => t.z || 0));
  tile.z = maxZ + 1;
}

export function sendTileToBack(tile) {
  const minZ = Math.min(0, ...state.playgroundArrangement.map(t => t.z || 0));
  tile.z = minZ - 1;
}

export function getSelectedPlaygroundTile() {
  return state.playgroundArrangement.find(t => t.uid === state.selectedPlaygroundUid) || null;
}

// Lightweight selection update used during click/drag-start: just toggles the 'selected'
// class and refreshes the panel, without a full re-render that would disrupt an in-progress drag.
function selectPlaygroundTile(tileUid) {
  state.selectedPlaygroundUid = tileUid;
  document.querySelectorAll('#collage-playground .tile.selected').forEach(el => el.classList.remove('selected'));
  if (tileUid) {
    const el = document.querySelector(`#collage-playground .tile[data-uid="${tileUid}"]`);
    if (el) el.classList.add('selected');
  }
  updatePlaygroundPanel();
}

export function updatePlaygroundPanel() {
  const tile = getSelectedPlaygroundTile();
  document.getElementById('panel-empty').hidden = !!tile;
  document.getElementById('panel-controls').hidden = !tile;
}

export function renderPlayground() {
  const container = document.getElementById('collage-playground');
  container.innerHTML = '';

  state.playgroundArrangement.forEach(tile => {
    const div = document.createElement('div');
    div.className = 'tile playground-tile' + (tile.uid === state.selectedPlaygroundUid ? ' selected' : '');
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

export function setupPlaygroundDropTarget() {
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
    const maxZ = Math.max(0, ...state.playgroundArrangement.map(t => t.z || 0));
    const newTile = { uid: uid(), image: info.image, name: info.name, x, y, width: size, height: size, z: maxZ + 1 };
    state.playgroundArrangement.push(newTile);
    state.selectedPlaygroundUid = newTile.uid;
    renderPlayground();
    updatePlaygroundPanel();
  });
}

export function setupPlaygroundPanel() {
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
    const size = computeContainerSize(state.currentFrame);
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
    if (!state.selectedPlaygroundUid) return;
    state.playgroundArrangement = state.playgroundArrangement.filter(t => t.uid !== state.selectedPlaygroundUid);
    state.selectedPlaygroundUid = null;
    renderPlayground();
    updatePlaygroundPanel();
  });
}

export function setActiveTab(tab) {
  state.activeTab = tab;
  document.getElementById('tab-auto').classList.toggle('active', tab === 'auto');
  document.getElementById('tab-playground').classList.toggle('active', tab === 'playground');
  document.getElementById('collage').hidden = tab !== 'auto';
  document.getElementById('playground-wrap').hidden = tab !== 'playground';
  document.getElementById('playground-reset').hidden = tab !== 'playground';

  if (tab === 'playground' && !state.playgroundInitialized) {
    initPlaygroundFromAutomated();
  }
}
