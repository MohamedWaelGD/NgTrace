import { describe, expect, it } from 'vitest';
import { diffEntries, LiveThrottle } from './live';

const entry = (name: string, preview: string, expandable = false) => ({ name, preview, expandable });

describe('Live Values diff', () => {
  it('reports nothing when the values are unchanged', () => {
    const state = [entry('title', '"Shop"'), entry('items', 'Array(2)', true)];
    expect(diffEntries(state, state.map((e) => ({ ...e })))).toEqual([]);
  });

  it('lists exactly the changed, added and removed names', () => {
    const before = [entry('status', '""'), entry('count', '1'), entry('gone', 'true')];
    const after = [entry('status', '"Added"'), entry('count', '1'), entry('fresh', '0')];
    expect(diffEntries(before, after).sort()).toEqual(['fresh', 'gone', 'status']);
  });
});

describe('Live Values throttle', () => {
  it('reads every 250 ms while reads are cheap', () => {
    const throttle = new LiveThrottle();
    throttle.record(2);
    expect(throttle.interval).toBe(250);
    expect(throttle.throttled).toBe(false);
  });

  it('backs off on slow reads, capped at one second', () => {
    const throttle = new LiveThrottle();
    throttle.record(20);
    expect(throttle.interval).toBe(500);
    expect(throttle.throttled).toBe(true);
    for (let i = 0; i < 5; i++) throttle.record(20);
    expect(throttle.interval).toBe(1000);
  });

  it('recovers once reads are fast again', () => {
    const throttle = new LiveThrottle();
    for (let i = 0; i < 3; i++) throttle.record(20);
    for (let i = 0; i < 3; i++) throttle.record(1);
    expect(throttle.interval).toBe(250);
    expect(throttle.throttled).toBe(false);
  });
});
