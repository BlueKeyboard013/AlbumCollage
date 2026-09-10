# Album Collage

Small web app that fetches a Spotify user's top tracks and displays a collage of album covers (unique albums only).

Live: https://album-collage.onrender.com/

Prereqs
- Node.js 18+ (or compatible)
- A Spotify developer app (Client ID & Client Secret). Set the app's Redirect URI to `http://127.0.0.1:8888/callback` (Spotify no longer accepts `localhost` as a hostname — it must be the literal loopback IP `127.0.0.1`).

Setup

1. Copy `.env.example` to `.env` and fill `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`.
2. Install dependencies:

```bash
npm install
```

3. Run the server:

```bash
npm start
```

4. Open `http://localhost:8888` and click "Login with Spotify". After authorizing, the app will fetch your top tracks and show a collage of unique album covers.

5. Use the controls to choose a Square or Rectangle layout, pick the grid size, and drag the size slider to enlarge or shrink the collage. Click "Download Collage" to export the current view as a PNG.

Notes
- The app uses the `user-top-read` scope.
- It fetches top tracks in batches and ensures only one cover per album is included. If duplicates are found it continues fetching additional top tracks until enough unique albums are collected (or a limit).
- Access and refresh tokens are stored in httpOnly cookies (not in browser `localStorage`), and the server transparently refreshes an expired access token using the refresh token, so you shouldn't need to log in again each time the token expires. Click "Logout" to clear the session.
