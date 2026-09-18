// Song search box: looks up tracks and renders them as draggable results that can be
// dropped onto either collage tab to add that album cover.
import { searchTracks } from './api.js';

export async function searchSongs() {
  const q = document.getElementById('song-search').value.trim();
  const resultsEl = document.getElementById('search-results');
  if (!q) {
    resultsEl.hidden = true;
    resultsEl.innerHTML = '';
    return;
  }
  try {
    const tracks = await searchTracks(q);
    renderSearchResults(tracks);
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
