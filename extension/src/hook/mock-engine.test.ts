import { describe, expect, it, vi } from 'vitest';
import type { MockRule } from '@ngapi/protocol';
import { MockEngine } from './mock-engine';

const rule = (overrides: Partial<MockRule> = {}): MockRule => ({
  id: 'r',
  enabled: true,
  method: '*',
  pattern: '/api/*',
  regex: false,
  component: null,
  delayMs: 0,
  action: { kind: 'error' },
  ...overrides,
});
const target = { method: 'GET', url: 'http://localhost/api/x', className: null };

function setup(hint = false) {
  let time = 0;
  const timers: { at: number; fn: () => void }[] = [];
  let stored = hint;
  const onGateTimeout = vi.fn();
  const engine = new MockEngine({
    now: () => time,
    schedule: (fn, ms) => timers.push({ at: time + ms, fn }),
    hint: { get: () => stored, set: (on) => void (stored = on) },
    onGateTimeout,
  });
  const advance = (ms: number) => {
    time += ms;
    for (const t of timers.filter((x) => x.at <= time)) {
      timers.splice(timers.indexOf(t), 1);
      t.fn();
    }
  };
  return { engine, advance, onGateTimeout, hint: () => stored };
}

describe('MockEngine: matching', () => {
  it('matches nothing until the panel arms it', () => {
    const { engine } = setup();
    expect(engine.match(target)).toBeNull();
    engine.arm([rule()]);
    expect(engine.match(target)?.id).toBe('r');
  });

  it('disarms when the panel stops refreshing it (the panel closed)', () => {
    const { engine, advance } = setup();
    engine.arm([rule()]);
    advance(14_000);
    expect(engine.match(target)).not.toBeNull();
    advance(2_000);
    expect(engine.match(target)).toBeNull();
    expect(engine.active()).toBe(0);
  });

  it('a refresh extends the lease and replaces the rules', () => {
    const { engine, advance } = setup();
    engine.arm([rule({ id: 'a' })]);
    advance(10_000);
    engine.arm([rule({ id: 'b' })]);
    advance(10_000);
    expect(engine.match(target)?.id).toBe('b');
  });

  it('can be disarmed explicitly and counts only enabled rules', () => {
    const { engine } = setup();
    engine.arm([rule(), rule({ id: 'off', enabled: false })]);
    expect(engine.active()).toBe(1);
    engine.disarm();
    expect(engine.match(target)).toBeNull();
  });
});

describe('MockEngine: holding early requests', () => {
  it('does not hold anything when no rules were armed for this origin', () => {
    expect(setup(false).engine.gate()).toBeNull();
  });

  it('holds requests until the rules arrive when the origin was armed before', async () => {
    const { engine } = setup(true);
    const gate = engine.gate();
    expect(gate).not.toBeNull();
    engine.arm([rule()]);
    await expect(gate).resolves.toBeUndefined();
    expect(engine.gate()).toBeNull();
  });

  it('gives up after the timeout with a warning, and stops holding', async () => {
    const { engine, advance, onGateTimeout } = setup(true);
    const gate = engine.gate();
    advance(500);
    await expect(gate).resolves.toBeUndefined();
    expect(onGateTimeout).toHaveBeenCalledTimes(1);
    expect(engine.gate()).toBeNull();
  });

  it('remembers across reloads only while rules are enabled', () => {
    const { engine, hint } = setup();
    engine.arm([rule()]);
    expect(hint()).toBe(true);
    engine.arm([rule({ enabled: false })]);
    expect(hint()).toBe(false);
  });
});
