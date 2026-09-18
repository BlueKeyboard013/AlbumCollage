// Entry point: wires up all the event listeners and kicks off the initial load.
// Loaded as <script type="module" src="js/main.js">, which is what pulls in every other file.
import { state } from './state.js';
import { isLoggedIn } from './api.js';
import { applyFrame } from './frame.js';
import { loadTopTracks, renderCollage, setupCollageDropTarget } from './automated.js';
import {
  renderPlayground,
  updatePlaygroundPanel,
  initPlaygroundFromAutomated,
  setupPlaygroundDropTarget,
  setupPlaygroundPanel,
  setActiveTab
} from './playground.js';
import { downloadCollage } from './download.js';
import { searchSongs } from './search.js';

async function updateLoginUI() {
  state.loggedIn = await isLoggedIn();
  document.getElementById('login').hidden = state.loggedIn;
  document.getElementById('logout').hidden = !state.loggedIn;
  document.getElementById('time-range-group').hidden = !state.loggedIn;
  return state.loggedIn;
}

async function init() {
  document.getElementById('login').addEventListener('click', () => { window.location = '/login'; });
  document.getElementById('logout').addEventListener('click', async () => {
    await fetch('/logout', { method: 'POST' });
    state.arrangement = [];
    state.usingTopTracks = false;
    state.playgroundArrangement = [];
    state.playgroundInitialized = false;
    state.selectedPlaygroundUid = null;
    renderPlayground();
    updatePlaygroundPanel();
    await updateLoginUI();
    await loadTopTracks(); // falls back to the public global top-50 now that we're logged out
  });
  document.getElementById('refresh').addEventListener('click', loadTopTracks);
  document.getElementById('scratch').addEventListener('click', () => {
    state.arrangement = [];
    state.usingTopTracks = false;
    renderCollage();
  });
  document.getElementById('download').addEventListener('click', downloadCollage);

  document.querySelectorAll('[data-frame]').forEach(btn => {
    btn.addEventListener('click', () => applyFrame(btn.dataset.frame));
  });

  document.getElementById('time-range').addEventListener('change', (e) => {
    state.currentTimeRange = e.target.value;
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
  await applyFrame(state.currentFrameKey); // sizes/clips the container; no-op refetch since usingTopTracks is still false here

  await updateLoginUI();
  await loadTopTracks(); // seeds from the user's own top tracks if logged in, otherwise the public global top-50
}

window.addEventListener('DOMContentLoaded', init);
