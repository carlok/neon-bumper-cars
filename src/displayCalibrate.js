'use strict';

/** Logical canvas width (Phaser config); includes sidebar. */
const DISPLAY_LOGIC_W = 1920;
/** Logical canvas height (Phaser config). */
const DISPLAY_LOGIC_H = 1080;
/** Playable arena width in world units (matches server ARENA_W). */
const ARENA_LOGIC_W = 1600;
/** Right sidebar width in world units (leaderboard + QR); DISPLAY_LOGIC_W − ARENA_LOGIC_W. */
const DISPLAY_SIDEBAR_WORLD = DISPLAY_LOGIC_W - ARENA_LOGIC_W;
/** World units per reference “cell” for admin cell-base calibration. */
const DISPLAY_CELL_REF_WORLD = 40;
/** Default visible arena columns when env config is missing/invalid. */
const DISPLAY_DEFAULT_ARENA_COLUMNS = 40;
/** Minimum supported visible arena columns. */
const DISPLAY_MIN_ARENA_COLUMNS = 8;
/** Maximum supported visible arena columns. */
const DISPLAY_MAX_ARENA_COLUMNS = 40;
/** Full-canvas center X (1920×1080); used when zoom ≤ 1. */
const DISPLAY_CAMERA_CENTER_X_FULL = DISPLAY_LOGIC_W / 2;
/** Main camera center Y. */
const DISPLAY_CAMERA_CENTER_Y = DISPLAY_LOGIC_H / 2;
/**
 * When zoom > 1, blend camera Y between top-anchored (shows leaderboard) and bottom-anchored (shows footer).
 * Slight shift down keeps sidebar footers/QR in frame when the viewport is shorter than the full 1080 layout.
 */
const DISPLAY_CAMERA_Y_ZOOM_ANCHOR_BLEND = 0.1;

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
 * Clamp arena columns to the supported range.
 * @param {number} arenaColumns
 * @returns {number}
 */
function sanitizeArenaColumns(arenaColumns) {
  const cols = Math.round(Number(arenaColumns));
  if (!Number.isFinite(cols) || cols <= 0) {
    return DISPLAY_DEFAULT_ARENA_COLUMNS;
  }
  return Math.max(DISPLAY_MIN_ARENA_COLUMNS, Math.min(DISPLAY_MAX_ARENA_COLUMNS, cols));
}

/**
 * Camera zoom so exactly `cols` arena columns (40 world units each) fit in the visible arena
 * when the camera is right-anchored (viewport ends at x = 1920, sidebar stays on screen).
 * Solves: DISPLAY_LOGIC_W / z − DISPLAY_SIDEBAR_WORLD = DISPLAY_CELL_REF_WORLD × cols.
 * @param {number} arenaColumns
 * @returns {number}
 */
function displayZoomForArenaColumns(arenaColumns) {
  const cols = sanitizeArenaColumns(arenaColumns);
  const denom = DISPLAY_CELL_REF_WORLD * cols + DISPLAY_SIDEBAR_WORLD;
  const z = DISPLAY_LOGIC_W / denom;
  return Math.max(1, Math.min(16, z));
}

/**
 * Normalize a target display resolution, falling back to the logical canvas size.
 * @param {number} targetWidth
 * @param {number} targetHeight
 * @returns {{ width: number, height: number }}
 */
function normalizeDisplayResolution(targetWidth, targetHeight) {
  const width = Number(targetWidth);
  const height = Number(targetHeight);
  return {
    width: Number.isFinite(width) && width >= 1 ? width : DISPLAY_LOGIC_W,
    height: Number.isFinite(height) && height >= 1 ? height : DISPLAY_LOGIC_H,
  };
}

/**
 * CSS size of the fitted 16:9 Phaser canvas inside the selected output resolution.
 * @param {number} targetWidth
 * @param {number} targetHeight
 * @returns {{ width: number, height: number }}
 */
function fitDisplayResolution(targetWidth, targetHeight) {
  const target = normalizeDisplayResolution(targetWidth, targetHeight);
  const scale = Math.min(
    target.width / DISPLAY_LOGIC_W,
    target.height / DISPLAY_LOGIC_H
  );
  return {
    width: DISPLAY_LOGIC_W * scale,
    height: DISPLAY_LOGIC_H * scale,
  };
}

/**
 * Camera center X for the display camera.
 * z ≤ 1: center full 1920-wide layout (arena + sidebar).
 * z > 1: right-anchor so the viewport ends at x = 1920 (leaderboard column stays visible).
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
  const halfW = DISPLAY_LOGIC_W / 2 / z;
  return DISPLAY_LOGIC_W - halfW;
}

/**
 * Camera center Y for the display camera.
 * z ≤ 1: center full height.
 * z > 1: blend between top- and bottom-anchored viewport so sidebar tail (QR/footer) stays readable.
 * @param {number} zoom
 * @returns {number}
 */
function displayCameraCenterY(zoom) {
  const z = Number(zoom);
  if (!Number.isFinite(z) || z <= 0) {
    return DISPLAY_CAMERA_CENTER_Y;
  }
  if (z <= 1) {
    return DISPLAY_CAMERA_CENTER_Y;
  }
  const halfH = DISPLAY_LOGIC_H / 2 / z;
  const cyTop = halfH;
  const cyBottom = DISPLAY_LOGIC_H - halfH;
  return cyTop + DISPLAY_CAMERA_Y_ZOOM_ANCHOR_BLEND * (cyBottom - cyTop);
}

/**
 * How many DISPLAY_CELL_REF_WORLD-wide strips of the arena are visible at this zoom
 * (matches display.html camera: full-frame at z≤1, right + blended vertical anchor at z>1).
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
  const cy = displayCameraCenterY(z);
  const x0 = Math.max(0, cx - halfW);
  const x1 = Math.min(ARENA_LOGIC_W, cx + halfW);
  const y0 = Math.max(0, cy - halfH);
  const y1 = Math.min(DISPLAY_LOGIC_H, cy + halfH);
  const w = Math.max(0, x1 - x0);
  const h = Math.max(0, y1 - y0);
  return {
    refCols: w / DISPLAY_CELL_REF_WORLD,
    refRows: h / DISPLAY_CELL_REF_WORLD,
  };
}

/**
 * Compute the display projection from a selected output resolution and a fixed arena-column count.
 * Columns represent how many 40-world-unit strips should be visible horizontally in the arena view.
 * @param {number} arenaColumns
 * @param {number} targetWidth
 * @param {number} targetHeight
 * @returns {{ arenaColumns: number, fittedWidth: number, fittedHeight: number, screenCellPx: number, zoom: number, visibleRefCols: number, visibleRefRows: number }}
 */
function computeDisplayProjection(arenaColumns, targetWidth, targetHeight) {
  const cols = sanitizeArenaColumns(arenaColumns);
  const fitted = fitDisplayResolution(targetWidth, targetHeight);
  const zoom = displayZoomForArenaColumns(cols);
  const vis = visibleArenaRefCellsAtZoom(zoom);
  const arenaCssW = arenaContentWidthCss(fitted.width);
  return {
    arenaColumns: cols,
    fittedWidth: fitted.width,
    fittedHeight: fitted.height,
    screenCellPx: cols > 0 ? arenaCssW / cols : 0,
    zoom,
    visibleRefCols: vis.refCols,
    visibleRefRows: vis.refRows,
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
  DISPLAY_SIDEBAR_WORLD,
  DISPLAY_CELL_REF_WORLD,
  DISPLAY_DEFAULT_ARENA_COLUMNS,
  DISPLAY_MIN_ARENA_COLUMNS,
  DISPLAY_MAX_ARENA_COLUMNS,
  DISPLAY_CAMERA_CENTER_X_FULL,
  DISPLAY_CAMERA_CENTER_Y,
  resolutionCellMultiplier,
  arenaContentWidthCss,
  sanitizeArenaColumns,
  displayZoomForArenaColumns,
  normalizeDisplayResolution,
  fitDisplayResolution,
  displayCameraCenterX,
  displayCameraCenterY,
  DISPLAY_CAMERA_Y_ZOOM_ANCHOR_BLEND,
  visibleArenaRefCellsAtZoom,
  computeDisplayProjection,
  computeDisplayCameraZoom,
};
