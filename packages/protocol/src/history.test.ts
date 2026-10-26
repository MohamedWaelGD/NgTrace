import { describe, expect, it } from 'vitest';
import { ValueHistory, historyKey } from './history';
import type { LiveUpdate, ValueTarget } from './types';

const target: ValueTarget = { kind: 'component', id: 1 };
const base = (at = 0) => ({
  at,
  inputs: [{ name: 'productId', preview: '1' }],
  lists: [{ path: [] as string[], entries: [{ name: 'count', preview: '0', expandable: false }] }],
  signals: [{ id: '3', kind: 'signal', label: 'id', preview: '1', dependsOn: [] }],
});

/** A Live Values update where `count` became `n`. */
const countUpdate = (at: number, n: number, t: ValueTarget = target): LiveUpdate => ({
  target: t,
  at,
  lists: [{ path: [], entries: [{ name: 'count', preview: String(n), expandable: false }] }],
  changedInputs: [],
  changedPaths: [['count']],
  throttled: false,
});

describe('ValueHistory', () => {
  it('applies updates into snapshots and reports what changed at each step', () => {
    const history = new ValueHistory(target, base());
    history.apply(countUpdate(10, 1));
    history.apply({
      target,
      at: 20,
      inputs: [{ name: 'productId', preview: '2' }],
      lists: [],
      changedInputs: ['productId'],
      changedPaths: [],
      signals: [{ id: '3', kind: 'signal', label: 'id', preview: '2', dependsOn: [] }],
      changedSignals: ['3'],
      throttled: false,
    });
    expect(history.length).toBe(3);
    expect(history.at(0).lists[historyKey.path([])][0].preview).toBe('0');
    expect(history.at(1).lists[historyKey.path([])][0].preview).toBe('1');
    expect(history.at(2).lists[historyKey.path([])][0].preview).toBe('1');
    expect(history.at(2).inputs[0].preview).toBe('2');
    expect(history.at(2).signals![0].preview).toBe('2');
    expect(history.changedAt(0)).toEqual([]);
    expect(history.changedAt(1)).toEqual([historyKey.path(['count'])]);
    expect(history.changedAt(2)).toEqual([historyKey.input('productId'), historyKey.signal('3')]);
  });

  it('keeps expanded paths, and adds lists for paths expanded later', () => {
    const history = new ValueHistory(target, base());
    history.apply({ ...countUpdate(10, 1), lists: [{ path: ['user'], entries: [{ name: 'name', preview: '"Ada"', expandable: false }] }], changedPaths: [] });
    expect(Object.keys(history.at(1).lists).sort()).toEqual([historyKey.path([]), historyKey.path(['user'])].sort());
  });

  it('drops the oldest snapshot beyond 200 changes', () => {
    const history = new ValueHistory(target, base());
    for (let i = 1; i <= 205; i++) history.apply(countUpdate(i, i));
    expect(history.length).toBe(ValueHistory.MAX);
    expect(history.at(0).lists[historyKey.path([])][0].preview).toBe('6');
    expect(history.at(ValueHistory.MAX - 1).lists[historyKey.path([])][0].preview).toBe('205');
  });

  it('finds the last snapshot taken before a time (the values just before a request was sent)', () => {
    const history = new ValueHistory(target, base(0));
    history.apply(countUpdate(10, 1));
    history.apply(countUpdate(20, 2));
    expect(history.before(15)).toBe(1);
    expect(history.before(20)).toBe(1);
    expect(history.before(25)).toBe(2);
    expect(history.before(0)).toBe(-1);
  });

  it('ignores updates for another target, and starts over when cleared for a new target', () => {
    const history = new ValueHistory(target, base());
    history.apply(countUpdate(10, 1, { kind: 'component', id: 2 }));
    expect(history.length).toBe(1);
    history.apply(countUpdate(10, 1));
    history.clear({ kind: 'service', id: 9 }, { at: 30, inputs: [], lists: [], signals: null });
    expect(history.length).toBe(1);
    expect(history.target).toEqual({ kind: 'service', id: 9 });
  });
});
