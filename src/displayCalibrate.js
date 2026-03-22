'use strict';

/** Logical canvas width (Phaser config); includes sidebar. */
const DISPLAY_LOGIC_W = 1920;
/** Playable arena width in world units (matches server ARENA_W). */
const ARENA_LOGIC_W = 1600;
/** World units per reference “cell” for admin cell-base calibration. */
const DISPLAY_CELL_REF_WORLD = 40;

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
 * Camera zoom so DISPLAY_CELL_REF_WORLD spans (cellBasePx * k) CSS pixels on the fitted width.
 * @param {number} cellBasePx - admin “screen cell” width in px (before k)
 * @param {number} displayW - fitted canvas width in CSS px
 * @param {number} displayH - fitted canvas height in CSS px
 * @returns {{ zoom: number, k: number, effectiveBase: number, arenaDw: number }}
 */
function computeDisplayCameraZoom(cellBasePx, displayW, displayH) {
  const s = Number(cellBasePx);
  if (!Number.isFinite(s) || s < 8) {
    return { zoom: 1, k: 1, effectiveBase: 40, arenaDw: arenaContentWidthCss(displayW || 0) };
  }
  const dw = displayW;
  const dh = displayH;
  if (!dw || dw < 1) {
    return { zoom: 1, k: 1, effectiveBase: s, arenaDw: 0 };
  }
  const k = resolutionCellMultiplier(dw, dh);
  const effectiveBase = s * k;
  let z = (effectiveBase * DISPLAY_LOGIC_W) / (DISPLAY_CELL_REF_WORLD * dw);
  z = Math.max(0.2, Math.min(z, 16));
  return {
    zoom: z,
    k,
    effectiveBase,
    arenaDw: arenaContentWidthCss(dw),
  };
}

module.exports = {
  DISPLAY_LOGIC_W,
  ARENA_LOGIC_W,
  DISPLAY_CELL_REF_WORLD,
  resolutionCellMultiplier,
  arenaContentWidthCss,
  computeDisplayCameraZoom,
};
