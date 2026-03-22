'use strict';

const {
  DISPLAY_LOGIC_W,
  ARENA_LOGIC_W,
  DISPLAY_CELL_REF_WORLD,
  displayCameraCenterX,
  visibleArenaRefCellsAtZoom,
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

describe('displayCameraCenterX', () => {
  test('non-finite or non-positive zoom falls back to full-frame center', () => {
    const c = DISPLAY_LOGIC_W / 2;
    expect(displayCameraCenterX(NaN)).toBe(c);
    expect(displayCameraCenterX(Infinity)).toBe(c);
    expect(displayCameraCenterX(0)).toBe(c);
    expect(displayCameraCenterX(-1)).toBe(c);
  });

  test('z ≤ 1 centers full 1920 layout', () => {
    expect(displayCameraCenterX(1)).toBe(DISPLAY_LOGIC_W / 2);
    expect(displayCameraCenterX(0.5)).toBe(DISPLAY_LOGIC_W / 2);
  });

  test('z > 1 right-anchors so view ends at x = 1920', () => {
    const z = 2;
    const cx = displayCameraCenterX(z);
    const halfW = DISPLAY_LOGIC_W / 2 / z;
    expect(cx + halfW).toBeCloseTo(DISPLAY_LOGIC_W, 10);
  });
});

describe('visibleArenaRefCellsAtZoom', () => {
  test('non-finite or non-positive zoom yields zero ref cells', () => {
    expect(visibleArenaRefCellsAtZoom(NaN)).toEqual({ refCols: 0, refRows: 0 });
    expect(visibleArenaRefCellsAtZoom(0)).toEqual({ refCols: 0, refRows: 0 });
  });

  test('zoom 1 shows full arena width in ref cells', () => {
    const v = visibleArenaRefCellsAtZoom(1);
    expect(v.refCols).toBeCloseTo(ARENA_LOGIC_W / DISPLAY_CELL_REF_WORLD, 5);
    expect(v.refRows).toBeCloseTo(1080 / DISPLAY_CELL_REF_WORLD, 5);
  });

  test('zoom 2 right-anchored: 640 arena world units visible', () => {
    const v = visibleArenaRefCellsAtZoom(2);
    expect(v.refCols).toBeCloseTo(640 / DISPLAY_CELL_REF_WORLD, 5);
    expect(v.refRows).toBeCloseTo(540 / DISPLAY_CELL_REF_WORLD, 5);
  });
});

describe('computeDisplayCameraZoom', () => {
  test('invalid cell base returns zoom 1', () => {
    const r = computeDisplayCameraZoom(NaN, 1920, 1080);
    expect(r.zoom).toBe(1);
    expect(r.k).toBe(resolutionCellMultiplier(1920, 1080));
    expect(r.visibleRefCols).toBeCloseTo(ARENA_LOGIC_W / DISPLAY_CELL_REF_WORLD, 5);
  });

  test('invalid cell base with zero display height uses k=1', () => {
    const r = computeDisplayCameraZoom(NaN, 1920, 0);
    expect(r.zoom).toBe(1);
    expect(r.k).toBe(1);
    expect(r.approxArenaColumns).toBe(0);
  });

  test('zoom does not multiply by k (4K same formula as k=1)', () => {
    const base = 40;
    const w = 3840;
    const h = 2160;
    const r = computeDisplayCameraZoom(base, w, h);
    expect(r.k).toBeGreaterThan(1);
    const expected =
      (base * ARENA_LOGIC_W) / (DISPLAY_CELL_REF_WORLD * arenaContentWidthCss(w));
    expect(r.zoom).toBeCloseTo(Math.max(0.2, Math.min(expected, 16)), 10);
  });

  test('uses DISPLAY_LOGIC_W and reports arena column hint', () => {
    const r = computeDisplayCameraZoom(40, 1920, 1080);
    const expected =
      (40 * ARENA_LOGIC_W) / (DISPLAY_CELL_REF_WORLD * arenaContentWidthCss(1920));
    expect(r.zoom).toBeCloseTo(Math.max(0.2, Math.min(expected, 16)), 10);
    expect(r.arenaDw).toBeCloseTo(1920 * (ARENA_LOGIC_W / DISPLAY_LOGIC_W), 5);
    expect(r.approxArenaColumns).toBe(Math.floor(r.arenaDw / 40));
    expect(r.visibleRefCols).toBeCloseTo(ARENA_LOGIC_W / DISPLAY_CELL_REF_WORLD, 5);
    expect(r.visibleRefRows).toBeCloseTo(1080 / DISPLAY_CELL_REF_WORLD, 5);
  });

  test('larger cell base increases zoom and reduces visible ref cells', () => {
    const small = computeDisplayCameraZoom(32, 1920, 1080);
    const large = computeDisplayCameraZoom(96, 1920, 1080);
    expect(large.zoom).toBeGreaterThan(small.zoom);
    expect(large.visibleRefCols).toBeLessThan(small.visibleRefCols);
    expect(large.visibleRefRows).toBeLessThan(small.visibleRefRows);
  });

  test('invalid fitted width (< 1 css px) returns zoom 1 and zero sizing hints', () => {
    const r = computeDisplayCameraZoom(40, 0, 1080);
    expect(r.zoom).toBe(1);
    expect(r.arenaDw).toBe(0);
    expect(r.approxArenaColumns).toBe(0);
    expect(r.visibleRefCols).toBe(0);
    expect(r.visibleRefRows).toBe(0);
  });
});
