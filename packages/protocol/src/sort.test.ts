import { describe, expect, it } from 'vitest';
import { nextSort, sortRows } from './sort';

describe('sortRows', () => {
  const rows = [{ n: 'b', v: 2 }, { n: 'a', v: null }, { n: 'c', v: 1 }, { n: 'd', v: 2 }];

  it('sorts numbers both ways, keeping equal rows in their original order', () => {
    expect(sortRows(rows, (r) => r.v, 'asc').map((r) => r.n)).toEqual(['c', 'b', 'd', 'a']);
    expect(sortRows(rows, (r) => r.v, 'desc').map((r) => r.n)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('puts rows without a value last whichever way it sorts', () => {
    expect(sortRows(rows, (r) => r.v, 'asc').at(-1)?.n).toBe('a');
    expect(sortRows(rows, (r) => r.v, 'desc').at(-1)?.n).toBe('a');
  });

  it('compares text case-insensitively with numbers in order', () => {
    const names = ['item10', 'Item2', 'item1'];
    expect(sortRows(names, (s) => s, 'asc')).toEqual(['item1', 'Item2', 'item10']);
  });

  it('does not change the input', () => {
    const input = [2, 1];
    sortRows(input, (n) => n, 'asc');
    expect(input).toEqual([2, 1]);
  });
});

describe('nextSort', () => {
  it('cycles ascending, descending, unsorted, and restarts on another column', () => {
    const first = nextSort<'a' | 'b'>(null, 'a');
    expect(first).toEqual({ key: 'a', direction: 'asc' });
    const second = nextSort(first, 'a');
    expect(second).toEqual({ key: 'a', direction: 'desc' });
    expect(nextSort(second, 'a')).toBeNull();
    expect(nextSort(second, 'b')).toEqual({ key: 'b', direction: 'asc' });
  });
});
