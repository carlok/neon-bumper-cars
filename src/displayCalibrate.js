'use strict';

/** Logical canvas width (Phaser config); includes sidebar. */
const DISPLAY_LOGIC_W = 1920;
/** Logical canvas height (Phaser config). */
const DISPLAY_LOGIC_H = 1080;
/** Playable arena width in world units (matches server ARENA_W). */
const ARENA_LOGIC_W = 1600;
/** World units per reference “cell” for admin cell-base calibration. */
const DISPLAY_CELL_REF_WORLD = 40;
/** Full-canvas center X (1920×1080); used when zoom ≤ 1. */
const DISPLAY_CAMERA_CENTER_X_FULL = DISPLAY_LOGIC_W / 2;
/** Main camera center Y. */
const DISPLAY_CAMERA_CENTER_Y = DISPLAY_LOGIC_H / 2;

/**
 * Integer multiplier from fitted display CSS size (short side / step).
 * @param {number} displayW
 * @param {number} displayH
 * @param {number} [step]
 * @param {number} [minK]
 * @param {number} [maxK]
 * @returns {number}
 */
function resolutionCellMultiplier(displayW, displayH, step = 540, minK = 1, maxK = 8) {
  const m = Math.min(displayW, displayH);
  return Math.max(minK, Math.min(maxK, Math.round(m / step)));
}

/**
 * Arena width in CSS pixels after Scale.FIT (same aspect as logical canvas).
 * @param {number} displayWidthCss
 * @returns {number}
 */
function arenaContentWidthCss(displayWidthCss) {
  return displayWidthCss * (ARENA_LOGIC_W / DISPLAY_LOGIC_W);
}

/**
 * Camera center X so the leaderboard (320 world units at x ≥ 1600) stays on-screen when zoomed in.
 * z ≤ 1: center full 1920-wide layout (arena + sidebar). z > 1: pin right edge to x = 1920.
 * @param {number} zoom
 * @returns {number}
 */
function displayCameraCenterX(zoom) {
  const z = Number(zoom);
  if (!Number.isFinite(z) || z <= 0) {
    return DISPLAY_CAMERA_CENTER_X_FULL;
  }
  if (z <= 1) {
    return DISPLAY_CAMERA_CENTER_X_FULL;
  }
  return DISPLAY_LOGIC_W - DISPLAY_LOGIC_W / 2 / z;
}

/**
 * How many DISPLAY_CELL_REF_WORLD-wide strips of the arena are visible at this zoom
 * (matches display.html camera: full-frame at z≤1, right-anchored at z>1).
 * @param {number} zoom
 * @returns {{ refCols: number, refRows: number }}
 */
function visibleArenaRefCellsAtZoom(zoom) {
  const z = Number(zoom);
  if (!Number.isFinite(z) || z <= 0) {
    return { refCols: 0, refRows: 0 };
  }
  const halfW = DISPLAY_LOGIC_W / 2 / z;
  const halfH = DISPLAY_LOGIC_H / 2 / z;
  const cx = displayCameraCenterX(z);
  const x0 = Math.max(0, cx - halfW);
  const x1 = Math.min(ARENA_LOGIC_W, cx + halfW);
  const y0 = Math.max(0, DISPLAY_CAMERA_CENTER_Y - halfH);
  const y1 = Math.min(DISPLAY_LOGIC_H, DISPLAY_CAMERA_CENTER_Y + halfH);
  const w = Math.max(0, x1 - x0);
  const h = Math.max(0, y1 - y0);
  return {
    refCols: w / DISPLAY_CELL_REF_WORLD,
    refRows: h / DISPLAY_CELL_REF_WORLD,
  };
}

/**
 * Camera zoom so DISPLAY_CELL_REF_WORLD spans cellBasePx CSS pixels measured on the **arena** slice
 * of the fitted canvas (not the full 1920 width — sidebar stays a fixed readable fraction).
 * Algebra: (s * ARENA_W) / (40 * arenaDw) === (s * 1920) / (40 * displayW).
 * Do not multiply by resolutionCellMultiplier here — that was over-zooming large / Retina displays.
 * @param {number} cellBasePx - admin “screen cell” width in px
 * @param {number} displayW - fitted canvas width in CSS px
 * @param {number} displayH - fitted canvas height in CSS px
 * @returns {{ zoom: number, k: number, arenaDw: number, approxArenaColumns: number, visibleRefCols: number, visibleRefRows: number }}
 */
function computeDisplayCameraZoom(cellBasePx, displayW, displayH) {
  const s = Number(cellBasePx);
  const dw0 = displayW || 0;
  const dh0 = displayH || 0;
  const k = dw0 >= 1 && dh0 >= 1 ? resolutionCellMultiplier(dw0, dh0) : 1;
  const arenaDw = arenaContentWidthCss(dw0);
  if (!Number.isFinite(s) || s < 8) {
    const vis = visibleArenaRefCellsAtZoom(1);
    return {
      zoom: 1,
      k,
      arenaDw,
      approxArenaColumns: 0,
      visibleRefCols: vis.refCols,
      visibleRefRows: vis.refRows,
    };
  }
  const dw = displayW;
  const dh = displayH;
  if (!dw || dw < 1) {
    return {
      zoom: 1,
      k,
      arenaDw: 0,
      approxArenaColumns: 0,
      visibleRefCols: 0,
      visibleRefRows: 0,
    };
  }
  const arenaDwForZ = arenaContentWidthCss(dw);
  let z = (s * ARENA_LOGIC_W) / (DISPLAY_CELL_REF_WORLD * arenaDwForZ);
  z = Math.max(0.2, Math.min(z, 16));
  const approxArenaColumns = Math.max(0, Math.floor(arenaDw / s));
  const vis = visibleArenaRefCellsAtZoom(z);
  return {
    zoom: z,
    k,
    arenaDw: arenaContentWidthCss(dw),
    approxArenaColumns,
    visibleRefCols: vis.refCols,
    visibleRefRows: vis.refRows,
  };
}

module.exports = {
  DISPLAY_LOGIC_W,
  DISPLAY_LOGIC_H,
  ARENA_LOGIC_W,
  DISPLAY_CELL_REF_WORLD,
  DISPLAY_CAMERA_CENTER_X_FULL,
  DISPLAY_CAMERA_CENTER_Y,
  resolutionCellMultiplier,
  arenaContentWidthCss,
  displayCameraCenterX,
  visibleArenaRefCellsAtZoom,
  computeDisplayCameraZoom,
};
