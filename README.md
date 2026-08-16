# Album Collage

Small web app that fetches a Spotify user's top tracks and displays a collage of album covers (unique albums only).

Prereqs
- Node.js 18+ (or compatible)
- A Spotify developer app (Client ID & Client Secret). Set the app's Redirect URI to `http://localhost:8888/callback`.

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

Notes
- The app uses the `user-top-read` scope.
- It fetches top tracks in batches and ensures only one cover per album is included. If duplicates are found it continues fetching additional top tracks until enough unique albums are collected (or a limit).
