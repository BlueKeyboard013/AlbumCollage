async function getAccessToken() {
  const token = localStorage.getItem('spotify_access_token');
  return token;
}

async function fetchAlbums(limit = 50) {
  const token = await getAccessToken();
  if (!token) return null;
  const resp = await fetch(`/api/top?limit=${limit}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error('Failed to fetch');
  const data = await resp.json();
  return data.albums || [];
}

function renderCollage(albums) {
  const container = document.getElementById('collage');
  container.innerHTML = '';
  for (const a of albums) {
    const img = document.createElement('img');
    img.src = a.image || '';
    img.alt = a.name || '';
    container.appendChild(img);
  }
}

async function init() {
  const loginBtn = document.getElementById('login');
  const refreshBtn = document.getElementById('refresh');

  loginBtn.addEventListener('click', () => { window.location = '/login'; });
  refreshBtn.addEventListener('click', loadAndRender);

  // If token present, auto-load
  const token = await getAccessToken();
  if (token) {
    await loadAndRender();
  }
}

async function loadAndRender() {
  try {
    const albums = await fetchAlbums(50);
    if (!albums) {
      alert('Not logged in. Click "Login with Spotify" first.');
      return;
    }
    renderCollage(albums);
  } catch (err) {
    console.error(err);
    alert('Failed to load albums. Check console.');
  }
}

window.addEventListener('DOMContentLoaded', init);
