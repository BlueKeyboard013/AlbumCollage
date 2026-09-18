// A single shared mutable object, imported by every module that needs to read or update
// app state. Using one object (rather than separate `let` exports) means other modules
// always see live values without needing their own setter functions for every field.
import { FRAME_PRESETS } from './constants.js';

export const state = {
  currentFrameKey: 'poster:18x24',
  currentFrame: FRAME_PRESETS['poster:18x24'],
  currentTimeRange: 'medium_term',

  arrangement: [],       // Automated tab: { uid, image, name } — order maps onto the justified grid
  usingTopTracks: false, // true when arrangement was auto-filled from Spotify top tracks (vs. manually built)

  activeTab: 'auto',     // 'auto' | 'playground'
  playgroundArrangement: [], // Playground tab: { uid, image, name, x, y, width, height, z }
  playgroundInitialized: false,
  selectedPlaygroundUid: null,

  loggedIn: false // logged-out visitors still get a working collage, seeded from a public top-50 playlist
};
