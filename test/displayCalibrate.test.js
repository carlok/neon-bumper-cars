'use strict';

const {
  DISPLAY_LOGIC_W,
  ARENA_LOGIC_W,
  DISPLAY_CELL_REF_WORLD,
  resolutionCellMultiplier,
  arenaContentWidthCss,
  computeDisplayCameraZoom,
} = require('../src/displayCalibrate');

describe('resolutionCellMultiplier', () => {
  test('720p short side → k=1', () => {
    expect(resolutionCellMultiplier(1280, 720)).toBe(1);
  });

  test('1080p short side → k=2', () => {
    expect(resolutionCellMultiplier(1920, 1080)).toBe(2);
  });

  test('4K min dimension 2160 → k=4', () => {
    expect(resolutionCellMultiplier(3840, 2160)).toBe(4);
  });

  test('clamped to max 8', () => {
    expect(resolutionCellMultiplier(10000, 5000)).toBe(8);
  });

  test('clamped to min 1', () => {
    expect(resolutionCellMultiplier(200, 200)).toBe(1);
  });
});

describe('arenaContentWidthCss', () => {
  test('1920 fitted width → 1600 arena slice', () => {
    expect(arenaContentWidthCss(1920)).toBeCloseTo(1600, 5);
  });
});

describe('computeDisplayCameraZoom', () => {
  test('invalid cell base returns zoom 1', () => {
    const r = computeDisplayCameraZoom(NaN, 1920, 1080);
    expect(r.zoom).toBe(1);
    expect(r.k).toBe(1);
  });

  test('k>1 increases zoom vs k=1 at same resolution', () => {
    const base = 40;
    const w = 3840;
    const h = 2160;
    const r = computeDisplayCameraZoom(base, w, h);
    expect(r.k).toBeGreaterThan(1);
    const rFlat = (base * DISPLAY_LOGIC_W) / (DISPLAY_CELL_REF_WORLD * w);
    expect(r.zoom).toBeGreaterThan(rFlat);
  });

  test('uses DISPLAY_LOGIC_W in formula', () => {
    const r = computeDisplayCameraZoom(40, 1920, 1080);
    const k = resolutionCellMultiplier(1920, 1080);
    const effectiveBase = 40 * k;
    const expected = (effectiveBase * DISPLAY_LOGIC_W) / (DISPLAY_CELL_REF_WORLD * 1920);
    expect(r.zoom).toBeCloseTo(Math.max(0.2, Math.min(expected, 16)), 10);
    expect(r.arenaDw).toBeCloseTo(1920 * (ARENA_LOGIC_W / DISPLAY_LOGIC_W), 5);
  });
});
