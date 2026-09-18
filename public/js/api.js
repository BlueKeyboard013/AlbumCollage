// All network calls to our own server live here. Nothing in this file touches the DOM.
import { state } from './state.js';

export async function isLoggedIn() {
  const resp = await fetch('/api/session');
  const data = await resp.json();
  return !!data.loggedIn;
}

// Uses the user's personal top tracks when logged in, otherwise a public global top-50 playlist.
export async function fetchAlbums(limit) {
  const url = state.loggedIn
    ? `/api/top?limit=${limit}&time_range=${state.currentTimeRange}`
    : `/api/public/top?limit=${limit}`;
  const resp = await fetch(url);
  if (resp.status === 401) return null;
  if (!resp.ok) throw new Error('Failed to fetch');
  const data = await resp.json();
  return data.albums || [];
}

export async function searchTracks(query) {
  const url = state.loggedIn
    ? `/api/search?q=${encodeURIComponent(query)}`
    : `/api/public/search?q=${encodeURIComponent(query)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Search failed');
  const data = await resp.json();
  return data.tracks || [];
}
