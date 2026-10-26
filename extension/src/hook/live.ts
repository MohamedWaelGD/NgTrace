import { diffEntries, LiveThrottle, type InputValue, type LiveUpdate, type ValueEntry, type ValueTarget } from '@ngapi/protocol';

export interface LiveSource {
  inputs(id: number): InputValue[];
  entries(target: ValueTarget, path: string[]): ValueEntry[];
  isGone(target: ValueTarget): boolean;
}

/**
 * Live Values (ADR 5): after change detection, re-reads the followed target and its expanded paths,
 * at most every LiveThrottle.interval, and posts only the lists that changed.
 */
export class LiveValues {
  private target: ValueTarget | null = null;
  private paths: string[][] = [];
  private lastInputs: InputValue[] | null = null;
  private lastLists = new Map<string, ValueEntry[]>();
  private lastThrottled = false;
  private readonly throttle = new LiveThrottle();
  private scheduled = false;
  private lastRead = 0;
  /** Mirrors Recording: while paused, nothing is re-read. */
  paused = false;

  constructor(
    private readonly source: LiveSource,
    private readonly post: (update: LiveUpdate) => void,
    private readonly schedule: (fn: () => void, ms: number) => void,
  ) {}

  /** Follows a component or service and its expanded value paths; null stops. */
  follow(target: ValueTarget | null, paths: string[][]): void {
    const same = target && this.target && target.kind === this.target.kind && target.id === this.target.id;
    this.target = target;
    this.paths = paths.some((p) => !p.length) ? paths : [[], ...paths];
    if (!same) {
      this.lastInputs = null;
      this.lastLists.clear();
    }
    // Baseline for paths not read yet, so the first update after following only reports real changes.
    if (target) this.read(false);
  }

  /** Called on every change-detection end; coalesces into one read per interval. */
  changeDetected(): void {
    if (!this.target || this.paused || this.scheduled) return;
    this.scheduled = true;
    const wait = Math.max(0, this.lastRead + this.throttle.interval - Date.now());
    this.schedule(() => {
      this.scheduled = false;
      if (this.target && !this.paused) this.read(true);
    }, wait);
  }

  private read(publish: boolean): void {
    const target = this.target!;
    if (this.source.isGone(target)) {
      this.target = null;
      return;
    }
    const started = performance.now();
    const update: LiveUpdate = { target, lists: [], changedInputs: [], changedPaths: [], throttled: false };
    if (target.kind === 'component') {
      const inputs = this.source.inputs(target.id);
      if (this.lastInputs) update.changedInputs = diffEntries(this.lastInputs, inputs);
      if (!this.lastInputs || update.changedInputs.length) update.inputs = inputs;
      this.lastInputs = inputs;
    }
    for (const path of this.paths) {
      const key = JSON.stringify(path);
      const entries = this.source.entries(target, path);
      const before = this.lastLists.get(key);
      this.lastLists.set(key, entries);
      const changed = before ? diffEntries(before, entries) : [];
      if (!before || changed.length) update.lists.push({ path, entries });
      for (const name of changed) update.changedPaths.push([...path, name]);
    }
    this.lastRead = Date.now();
    if (publish) this.throttle.record(performance.now() - started);
    update.throttled = this.throttle.throttled;
    const changed = update.changedInputs.length || update.changedPaths.length || update.throttled !== this.lastThrottled;
    this.lastThrottled = update.throttled;
    if (publish && changed) this.post(update);
  }
}
