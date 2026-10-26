import type { SignalNode } from './signals';
import type { InputValue, LiveUpdate, ValueEntry, ValueTarget } from './types';

/**
 * Value History: snapshots of the Live Values target, rebuilt in the panel from the Live Values
 * diffs it already receives (no extra page cost). Times use the page's monotonic clock (`startMono`).
 */

export interface ValueSnapshot {
  at: number;
  inputs: InputValue[];
  /** Value lists (the root and expanded paths), keyed by `historyKey.path(path)`. */
  lists: Record<string, ValueEntry[]>;
  signals: SignalNode[] | null;
  /** What changed from the previous snapshot (`historyKey` values). */
  changed: string[];
}

export interface HistoryBase {
  at: number;
  inputs: InputValue[];
  lists: { path: string[]; entries: ValueEntry[] }[];
  signals: SignalNode[] | null;
}

/** Keys naming one changed row in a snapshot. */
export const historyKey = {
  input: (name: string) => `input\u0000${name}`,
  path: (path: string[]) => `path\u0000${JSON.stringify(path)}`,
  signal: (id: string) => `signal\u0000${id}`,
};

const sameTarget = (a: ValueTarget, b: ValueTarget) => a.kind === b.kind && a.id === b.id;

export class ValueHistory {
  static readonly MAX = 200;
  private snapshots: ValueSnapshot[] = [];

  constructor(
    public target: ValueTarget,
    base: HistoryBase,
  ) {
    this.clear(target, base);
  }

  get length(): number {
    return this.snapshots.length;
  }

  /** Starts over (another target was selected). */
  clear(target: ValueTarget, base: HistoryBase): void {
    this.target = target;
    const lists: Record<string, ValueEntry[]> = {};
    for (const l of base.lists) lists[historyKey.path(l.path)] = l.entries;
    this.snapshots = [{ at: base.at, inputs: base.inputs, lists, signals: base.signals, changed: [] }];
  }

  /** Adds the snapshot a Live Values update leads to; updates for another target are ignored. */
  apply(update: LiveUpdate): void {
    if (!sameTarget(update.target, this.target)) return;
    const prev = this.snapshots[this.snapshots.length - 1];
    const lists = { ...prev.lists };
    for (const l of update.lists) lists[historyKey.path(l.path)] = l.entries;
    const changed = [
      ...update.changedInputs.map(historyKey.input),
      ...update.changedPaths.map(historyKey.path),
      ...(update.changedSignals ?? []).map(historyKey.signal),
    ];
    this.snapshots.push({
      at: update.at ?? prev.at,
      inputs: update.inputs ?? prev.inputs,
      lists,
      signals: update.signals ?? prev.signals,
      changed,
    });
    if (this.snapshots.length > ValueHistory.MAX) this.snapshots.shift();
  }

  at(index: number): ValueSnapshot {
    return this.snapshots[index];
  }

  changedAt(index: number): string[] {
    return this.snapshots[index]?.changed ?? [];
  }

  /** Index of the last snapshot taken before `time` (e.g. a request's `startMono`); -1 when none. */
  before(time: number): number {
    for (let i = this.snapshots.length - 1; i >= 0; i--) if (this.snapshots[i].at < time) return i;
    return -1;
  }

  /** Snapshot times, oldest first. */
  times(): number[] {
    return this.snapshots.map((s) => s.at);
  }
}
