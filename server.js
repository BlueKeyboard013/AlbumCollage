require('dotenv').config();
const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const path = require('path');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 8888;
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${PORT}/callback`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.warn('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in environment');
}

// Print and validate redirect URI so errors from Spotify are clearer
console.log(`Effective REDIRECT_URI: ${REDIRECT_URI}`);
if (typeof REDIRECT_URI === 'string' && REDIRECT_URI.startsWith('http://')) {
  const host = REDIRECT_URI.replace(/^https?:\/\//, '').split('/')[0];
  if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    console.error('ERROR: REDIRECT_URI is insecure (http) and not localhost.');
    console.error('Spotify requires HTTPS for non-localhost redirect URIs.');
    console.error('Use a HTTPS redirect (for example via ngrok) or change REDIRECT_URI to use localhost.');
    process.exit(1);
  }
}

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: REDIRECT_URI.startsWith('https://'),
  path: '/'
};

app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

function base64Credentials() {
  return Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
}

function setTokenCookies(res, { access_token, refresh_token, expires_in }) {
  const expiresAt = Date.now() + expires_in * 1000;
  res.cookie('spotify_access_token', access_token, { ...COOKIE_OPTS, maxAge: expires_in * 1000 });
  res.cookie('spotify_token_expires_at', String(expiresAt), { ...COOKIE_OPTS, maxAge: expires_in * 1000 });
  if (refresh_token) {
    // refresh tokens are long-lived; keep for 30 days
    res.cookie('spotify_refresh_token', refresh_token, { ...COOKIE_OPTS, maxAge: 30 * 24 * 60 * 60 * 1000 });
  }
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

    setTokenCookies(res, tokenRes.data);
    res.redirect('/');
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Token exchange failed');
  }
});

app.post('/logout', (req, res) => {
  res.clearCookie('spotify_access_token', COOKIE_OPTS);
  res.clearCookie('spotify_token_expires_at', COOKIE_OPTS);
  res.clearCookie('spotify_refresh_token', COOKIE_OPTS);
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  res.json({ loggedIn: !!req.cookies.spotify_refresh_token });
});

async function refreshAccessToken(refreshToken) {
  const tokenRes = await axios.post('https://accounts.spotify.com/api/token', querystring.stringify({
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  }), {
    headers: {
      'Authorization': `Basic ${base64Credentials()}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  return tokenRes.data;
}

// Ensures req has a valid, non-expired access token, refreshing it via cookie if needed.
async function ensureAccessToken(req, res) {
  const refreshToken = req.cookies.spotify_refresh_token;
  if (!refreshToken) return null;

  const expiresAt = parseInt(req.cookies.spotify_token_expires_at || '0', 10);
  const hasValidAccessToken = req.cookies.spotify_access_token && Date.now() < expiresAt - 5000;
  if (hasValidAccessToken) return req.cookies.spotify_access_token;

  const data = await refreshAccessToken(refreshToken);
  // Spotify may omit refresh_token on refresh; keep the existing one in that case
  setTokenCookies(res, { ...data, refresh_token: data.refresh_token || refreshToken });
  return data.access_token;
}

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
  const needed = parseInt(req.query.limit || '50', 10);
  try {
    const accessToken = await ensureAccessToken(req, res);
    if (!accessToken) return res.status(401).json({ error: 'Not logged in' });
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
