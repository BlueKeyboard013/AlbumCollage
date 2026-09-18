// Poster-size / shape preset switching. Lives in its own module because it needs to
// coordinate both the Automated and Playground tabs when the frame changes.
import { state } from './state.js';
import { FRAME_PRESETS } from './constants.js';
import { computeContainerSize, desiredFetchCount } from './layout.js';
import { loadTopTracks, padOrTrimArrangement, renderCollage } from './automated.js';
import { renderPlayground } from './playground.js';

function updatePresetButtons() {
  document.querySelectorAll('[data-frame]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.frame === state.currentFrameKey);
  });
}

function applyFrameStyle(container, frame, size) {
  container.style.width = `${size.width}px`;
  container.style.height = `${size.height}px`;
  container.style.clipPath = frame.clip || 'none';
  if (frame.mask) {
    container.style.webkitMaskImage = frame.mask;
    container.style.maskImage = frame.mask;
    container.style.webkitMaskSize = '100% 100%';
    container.style.maskSize = '100% 100%';
    container.style.webkitMaskRepeat = 'no-repeat';
    container.style.maskRepeat = 'no-repeat';
  } else {
    container.style.webkitMaskImage = 'none';
    container.style.maskImage = 'none';
  }
}

export async function applyFrame(frameKey) {
  const oldSize = computeContainerSize(state.currentFrame);
  state.currentFrame = FRAME_PRESETS[frameKey];
  state.currentFrameKey = frameKey;
  const size = computeContainerSize(state.currentFrame);

  applyFrameStyle(document.getElementById('collage'), state.currentFrame, size);
  applyFrameStyle(document.getElementById('collage-playground'), state.currentFrame, size);

  if (state.playgroundInitialized && oldSize.width > 0 && oldSize.height > 0) {
    const scaleX = size.width / oldSize.width;
    const scaleY = size.height / oldSize.height;
    state.playgroundArrangement.forEach(t => {
      t.x *= scaleX; t.y *= scaleY; t.width *= scaleX; t.height *= scaleY;
    });
    renderPlayground();
  }

  updatePresetButtons();

  if (state.usingTopTracks) {
    // Re-pull the right number of top tracks for this frame's target tile count.
    await loadTopTracks();
  } else {
    // Manually built collage: keep every existing pick, but pad or trim to this frame's target count.
    const targetCount = desiredFetchCount(size.width, state.currentFrame);
    await padOrTrimArrangement(targetCount);
    renderCollage();
  }
}
