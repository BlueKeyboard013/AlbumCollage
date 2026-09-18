// Exports the current collage (whichever tab is active) as a PNG, rendered to a hidden
// <canvas> at a much higher resolution than the on-screen preview.
import { state } from './state.js';
import { DOWNLOAD_SCALE } from './constants.js';
import { computeContainerSize, computeLayout } from './layout.js';

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function applyCanvasClip(ctx, frame, w, h) {
  const shape = frame.canvasShape || 'rect';
  ctx.beginPath();
  if (shape === 'circle') {
    ctx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
  } else if (shape === 'triangle') {
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
  } else if (shape === 'heart') {
    const topCurveHeight = h * 0.3;
    ctx.moveTo(w / 2, topCurveHeight);
    ctx.bezierCurveTo(w / 2, topCurveHeight - h * 0.3, 0, topCurveHeight - h * 0.3, 0, topCurveHeight);
    ctx.bezierCurveTo(0, h * 0.6, w / 2, h * 0.9, w / 2, h);
    ctx.bezierCurveTo(w / 2, h * 0.9, w, h * 0.6, w, topCurveHeight);
    ctx.bezierCurveTo(w, topCurveHeight - h * 0.3, w / 2, topCurveHeight - h * 0.3, w / 2, topCurveHeight);
    ctx.closePath();
  } else {
    ctx.rect(0, 0, w, h);
  }
  ctx.clip();
}

export async function downloadCollage() {
  // Playground tiles must be drawn in the same back-to-front stacking order shown on screen.
  const list = state.activeTab === 'playground'
    ? [...state.playgroundArrangement].sort((a, b) => (a.z || 0) - (b.z || 0))
    : state.arrangement;
  if (!list.length) {
    alert('Add some album covers to the collage first.');
    return;
  }
  const size = computeContainerSize(state.currentFrame);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(size.width * DOWNLOAD_SCALE);
  canvas.height = Math.round(size.height * DOWNLOAD_SCALE);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  applyCanvasClip(ctx, state.currentFrame, canvas.width, canvas.height);

  // Automated: recompute the exact grid at export resolution. Playground: scale each tile's own free position/size.
  const positions = state.activeTab === 'playground'
    ? list.map(t => ({ x: t.x * DOWNLOAD_SCALE, y: t.y * DOWNLOAD_SCALE, width: t.width * DOWNLOAD_SCALE, height: t.height * DOWNLOAD_SCALE }))
    : computeLayout(state.arrangement.length, canvas.width, state.currentFrame);

  try {
    const images = await Promise.all(list.map(t => (t.image ? loadImage(t.image) : null)));
    images.forEach((img, i) => {
      if (!img) return;
      const pos = positions[i];
      ctx.drawImage(img, pos.x, pos.y, pos.width, pos.height);
    });

    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'album-collage.png';
      link.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  } catch (err) {
    console.error(err);
    alert('Failed to export collage image (album art failed to load for export).');
  }
}
