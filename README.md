# Album Collage

Small web app that fetches a Spotify user's top tracks and displays a collage of album covers (unique albums only).

Live: https://album-collage.onrender.com/

The shared instance above is limited to 5 manually-approved Spotify accounts (see "A note on Spotify's user cap" below). Anyone can browse and build a collage without logging in — it defaults to a collage of currently popular tracks. If you'd like personalized access (your own top tracks) on the shared instance, email jondevlaurent@gmail.com to be added to the allowlist, or deploy your own copy instead (see "Deploy your own instance").

## Deploy your own instance

Anyone can self-host their own copy in a few minutes, giving themselves (and up to 5 people they choose) access independent of our shared instance's cap.

1. Fork or clone this repo.
2. Create your own Spotify app at the [Developer Dashboard](https://developer.spotify.com/dashboard) — free and instant, no approval needed for Development Mode.
3. Deploy to [Render](https://render.com) (or any Node-friendly host):
   - **New → Blueprint**, point it at your fork. It picks up `render.yaml` automatically.
   - Fill in `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` from your new Spotify app.
   - After the first deploy, note the URL Render assigns (e.g. `https://your-app.onrender.com`), then set the `REDIRECT_URI` env var to `https://your-app.onrender.com/callback` and let it redeploy.
4. Add that same `https://your-app.onrender.com/callback` URL to your Spotify app's Redirect URIs in the dashboard.
5. In your Spotify app's **Settings → User Management**, add the Spotify account email of anyone you want to be able to log in (up to 5).

### A note on Spotify's user cap

Spotify has tightened Development Mode access twice in the last year. As of April 2025, Extended Quota Mode (the tier with no user limit) is restricted to organizations with 250,000+ monthly active users, so individual developers and small projects no longer qualify. Then, as of February 2026, Development Mode itself was cut from 25 manually-approved users down to just **5**, and the app owner's own Spotify account must have Premium for the app to work at all. That means every Development Mode app — including self-hosted ones — is capped at 5 explicitly-invited users, and whoever owns the Spotify app needs a Premium subscription. These are Spotify account-level restrictions; nothing about this app's code can work around them. Check the [Spotify for Developers](https://developer.spotify.com/documentation/web-api/concepts/quota-modes) page for the current numbers, since they've been changing.

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
