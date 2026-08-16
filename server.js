require('dotenv').config();
const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8888;
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${PORT}/callback`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.warn('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in environment');
}

app.use(express.static(path.join(__dirname, 'public')));

function base64Credentials() {
  return Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
}

app.get('/login', (req, res) => {
  const state = Math.random().toString(36).substring(2, 15);
  const scope = 'user-top-read';
  const params = querystring.stringify({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope,
    redirect_uri: REDIRECT_URI,
    state,
    show_dialog: true
  });
  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code || null;
  if (!code) return res.status(400).send('Missing code');

  try {
    const tokenRes = await axios.post('https://accounts.spotify.com/api/token', querystring.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI
    }), {
      headers: {
        'Authorization': `Basic ${base64Credentials()}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    const html = `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Logged in</title></head>
  <body>
    <script>
      localStorage.setItem('spotify_access_token', '${access_token}');
      localStorage.setItem('spotify_refresh_token', '${refresh_token}');
      localStorage.setItem('spotify_token_expires_in', '${expires_in}');
      window.location = '/';
    </script>
    <p>Redirecting...</p>
  </body>
</html>`;

    res.send(html);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Token exchange failed');
  }
});

async function fetchTopUniqueAlbums(accessToken, needed = 50, maxFetch = 300) {
  const albumMap = new Map();
  let offset = 0;
  const limit = 50;
  while (albumMap.size < needed && offset < maxFetch) {
    const url = `https://api.spotify.com/v1/me/top/tracks?limit=${limit}&offset=${offset}`;
    const resp = await axios.get(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const items = resp.data.items || [];
    if (items.length === 0) break;
    for (const track of items) {
      const album = track.album;
      if (!album) continue;
      if (!albumMap.has(album.id)) {
        // choose the largest image
        const image = (album.images && album.images.length) ? album.images[0].url : null;
        albumMap.set(album.id, { id: album.id, name: album.name, image, track: track.name, artist: track.artists.map(a=>a.name).join(', ') });
        if (albumMap.size >= needed) break;
      }
    }
    offset += limit;
    // avoid endless loops
    if (offset > 1000) break;
  }
  return Array.from(albumMap.values());
}

app.get('/api/top', async (req, res) => {
  const accessToken = req.headers.authorization?.split(' ')[1] || req.query.access_token;
  const needed = parseInt(req.query.limit || '50', 10);
  if (!accessToken) return res.status(400).json({ error: 'Missing access token' });
  try {
    const albums = await fetchTopUniqueAlbums(accessToken, needed);
    res.json({ albums });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch top tracks' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
