'use strict';

describe('src/config production ADMIN_PASSWORD', () => {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  };

  afterEach(() => {
    jest.resetModules();
    if (saved.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = saved.NODE_ENV;
    if (saved.ADMIN_PASSWORD === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = saved.ADMIN_PASSWORD;
  });

  test('throws when NODE_ENV is production and ADMIN_PASSWORD is unset', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ADMIN_PASSWORD;
    expect(() => {
      require('../src/config');
    }).toThrow(/ADMIN_PASSWORD/);
  });

  test('throws when NODE_ENV is production and ADMIN_PASSWORD is demo123', () => {
    process.env.NODE_ENV = 'production';
    process.env.ADMIN_PASSWORD = 'demo123';
    expect(() => {
      require('../src/config');
    }).toThrow(/ADMIN_PASSWORD/);
  });

  test('allows default demo123 when not production', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.ADMIN_PASSWORD;
    const cfg = require('../src/config');
    expect(cfg.ADMIN_PASSWORD).toBe('demo123');
  });

  test('uses custom ADMIN_PASSWORD when set', () => {
    process.env.NODE_ENV = 'test';
    process.env.ADMIN_PASSWORD = 'custom-secret';
    const cfg = require('../src/config');
    expect(cfg.ADMIN_PASSWORD).toBe('custom-secret');
  });
});
