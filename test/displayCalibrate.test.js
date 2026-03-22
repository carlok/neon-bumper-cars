'use strict';

const {
  DISPLAY_LOGIC_W,
  DISPLAY_LOGIC_H,
  ARENA_LOGIC_W,
  DISPLAY_CELL_REF_WORLD,
  DISPLAY_DEFAULT_ARENA_COLUMNS,
  displayCameraCenterX,
  displayCameraCenterY,
  DISPLAY_CAMERA_Y_ZOOM_ANCHOR_BLEND,
  visibleArenaRefCellsAtZoom,
  resolutionCellMultiplier,
  arenaContentWidthCss,
  sanitizeArenaColumns,
  fitDisplayResolution,
  computeDisplayProjection,
  computeDisplayCameraZoom,
  displayZoomForArenaColumns,
  normalizeDisplayResolution,
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

  test('z > 1 center x is 1920 minus half viewport width', () => {
    const z = 3;
    const halfW = DISPLAY_LOGIC_W / 2 / z;
    expect(displayCameraCenterX(z)).toBeCloseTo(DISPLAY_LOGIC_W - halfW, 10);
  });
});

describe('displayCameraCenterY', () => {
  test('non-finite or non-positive zoom falls back to full-frame center', () => {
    const c = DISPLAY_LOGIC_H / 2;
    expect(displayCameraCenterY(NaN)).toBe(c);
    expect(displayCameraCenterY(0)).toBe(c);
  });

  test('z ≤ 1 centers full height', () => {
    expect(displayCameraCenterY(1)).toBe(DISPLAY_LOGIC_H / 2);
    expect(displayCameraCenterY(0.5)).toBe(DISPLAY_LOGIC_H / 2);
  });

  test('z > 1 blends between top- and bottom-anchored Y', () => {
    const z = 2;
    const halfH = DISPLAY_LOGIC_H / 2 / z;
    const cyTop = halfH;
    const cyBottom = DISPLAY_LOGIC_H - halfH;
    const expected =
      cyTop + DISPLAY_CAMERA_Y_ZOOM_ANCHOR_BLEND * (cyBottom - cyTop);
    expect(displayCameraCenterY(z)).toBeCloseTo(expected, 10);
    expect(displayCameraCenterY(z)).toBeGreaterThan(cyTop);
    expect(displayCameraCenterY(z)).toBeLessThan(cyBottom);
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

  test('zoom 2 right-top-anchored: 640 arena world units wide, 540 tall', () => {
    const v = visibleArenaRefCellsAtZoom(2);
    // cx=1440, halfW=480 → x0=960, x1=1600 → 640 units visible
    expect(v.refCols).toBeCloseTo(640 / DISPLAY_CELL_REF_WORLD, 5);
    expect(v.refRows).toBeCloseTo((DISPLAY_LOGIC_H / 2) / DISPLAY_CELL_REF_WORLD, 5);
  });

  test('zoom 3 right-top-anchored: 320 arena world units wide, 360 tall', () => {
    const v = visibleArenaRefCellsAtZoom(3);
    expect(v.refCols).toBeCloseTo(320 / DISPLAY_CELL_REF_WORLD, 5);
    expect(v.refRows).toBeCloseTo((DISPLAY_LOGIC_H / 3) / DISPLAY_CELL_REF_WORLD, 5);
  });
});

describe('sanitizeArenaColumns', () => {
  test('invalid value falls back to default', () => {
    expect(sanitizeArenaColumns(NaN)).toBe(DISPLAY_DEFAULT_ARENA_COLUMNS);
    expect(sanitizeArenaColumns(0)).toBe(DISPLAY_DEFAULT_ARENA_COLUMNS);
  });

  test('clamps into supported range', () => {
    expect(sanitizeArenaColumns(2)).toBe(8);
    expect(sanitizeArenaColumns(80)).toBe(40);
  });

  test('rounds numeric input', () => {
    expect(sanitizeArenaColumns(19.6)).toBe(20);
  });
});

describe('normalizeDisplayResolution', () => {
  test('valid dimensions pass through', () => {
    expect(normalizeDisplayResolution(2560, 1440)).toEqual({ width: 2560, height: 1440 });
  });

  test('non-finite or sub-unity fall back to logical canvas', () => {
    expect(normalizeDisplayResolution(NaN, 1080)).toEqual({
      width: DISPLAY_LOGIC_W,
      height: DISPLAY_LOGIC_H,
    });
    expect(normalizeDisplayResolution(1920, 0)).toEqual({
      width: DISPLAY_LOGIC_W,
      height: DISPLAY_LOGIC_H,
    });
  });
});

describe('computeDisplayCameraZoom', () => {
  test('cell base below 8 yields zoom 1 and zero approx columns', () => {
    const r = computeDisplayCameraZoom(7, 1920, 1080);
    expect(r.zoom).toBe(1);
    expect(r.approxArenaColumns).toBe(0);
    expect(r.arenaDw).toBeCloseTo(1600, 5);
  });

  test('non-finite cell base yields zoom 1', () => {
    const r = computeDisplayCameraZoom(NaN, 1920, 1080);
    expect(r.zoom).toBe(1);
  });

  test('display width under 1 yields zoom 1 and zero visibility', () => {
    const r = computeDisplayCameraZoom(100, 0, 1080);
    expect(r.zoom).toBe(1);
    expect(r.arenaDw).toBe(0);
    expect(r.visibleRefCols).toBe(0);
  });

  test('80px cell on 1920×1080 fitted → zoom 2 and k from resolution multiplier', () => {
    const r = computeDisplayCameraZoom(80, 1920, 1080);
    expect(r.k).toBe(2);
    expect(r.arenaDw).toBeCloseTo(1600, 5);
    expect(r.zoom).toBeCloseTo(2, 5);
    expect(r.approxArenaColumns).toBe(20);
    expect(r.visibleRefCols).toBeCloseTo(
      visibleArenaRefCellsAtZoom(r.zoom).refCols,
      5
    );
  });

  test('huge cell base clamps zoom to 16', () => {
    const r = computeDisplayCameraZoom(2000, 1920, 1080);
    expect(r.zoom).toBe(16);
  });

  test('tiny cell base clamps zoom to 0.2', () => {
    const r = computeDisplayCameraZoom(8, 1920, 1080);
    expect(r.zoom).toBeGreaterThanOrEqual(0.2);
    expect(r.zoom).toBeLessThanOrEqual(16);
  });
});

describe('fitDisplayResolution', () => {
  test('16:9 target keeps full resolution', () => {
    expect(fitDisplayResolution(3840, 2160)).toEqual({ width: 3840, height: 2160 });
  });

  test('DCI 4K target fits down to 16:9 canvas width', () => {
    expect(fitDisplayResolution(4096, 2160)).toEqual({ width: 3840, height: 2160 });
  });

  test('invalid values fall back to logical default', () => {
    expect(fitDisplayResolution(NaN, 0)).toEqual({
      width: DISPLAY_LOGIC_W,
      height: DISPLAY_LOGIC_H,
    });
  });
});

describe('displayZoomForArenaColumns', () => {
  test('40 columns → zoom 1 (full layout, sidebar + arena)', () => {
    expect(displayZoomForArenaColumns(40)).toBeCloseTo(1, 10);
  });

  test('20 columns → zoom matches sidebar-aware formula', () => {
    expect(displayZoomForArenaColumns(20)).toBeCloseTo(1920 / (800 + 320), 10);
  });
});

describe('computeDisplayProjection', () => {
  test('40 arena columns: zoom 1, visible arena matches 40 ref columns, cell px = arena slice / 40', () => {
    const r = computeDisplayProjection(40, 1920, 1080);
    expect(r.arenaColumns).toBe(40);
    expect(r.zoom).toBeCloseTo(1, 10);
    expect(r.fittedWidth).toBe(1920);
    expect(r.fittedHeight).toBe(1080);
    expect(r.screenCellPx).toBeCloseTo(1600 / 40, 10);
    expect(r.visibleRefCols).toBeCloseTo(40, 5);
  });

  test('20 arena columns at DCI 4K: fitted size, arena-based cell px, ~20 visible ref cols', () => {
    const r = computeDisplayProjection(20, 4096, 2160);
    const z = 1920 / (800 + 320);
    const vis = visibleArenaRefCellsAtZoom(z);
    expect(r.arenaColumns).toBe(20);
    expect(r.fittedWidth).toBe(3840);
    expect(r.fittedHeight).toBe(2160);
    expect(r.screenCellPx).toBeCloseTo((3840 * (1600 / 1920)) / 20, 5);
    expect(r.zoom).toBeCloseTo(z, 10);
    expect(r.visibleRefCols).toBeCloseTo(20, 5);
    expect(r.visibleRefRows).toBeCloseTo(vis.refRows, 5);
  });

  test('same arena columns keep same zoom across resolutions but change pixel size', () => {
    const hd = computeDisplayProjection(20, 1920, 1080);
    const uhd = computeDisplayProjection(20, 3840, 2160);
    expect(uhd.zoom).toBeCloseTo(hd.zoom, 10);
    expect(uhd.screenCellPx).toBeCloseTo(hd.screenCellPx * 2, 10);
  });
});
