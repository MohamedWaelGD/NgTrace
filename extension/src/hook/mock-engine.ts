import { matchRule, type MockRule, type MockTarget } from '@ngtrace/protocol';

/** The panel refreshes the rules every few seconds; without a refresh the panel is gone (ADR 8). */
export const LEASE_MS = 15_000;
export const GATE_TIMEOUT_MS = 500;

export interface MockEngineOptions {
  now(): number;
  schedule(fn: () => void, ms: number): void;
  /** Synchronous page-side memory of "this origin had rules armed", read at document_start. */
  hint: { get(): boolean; set(on: boolean): void };
  onGateTimeout(): void;
}

/** Rules the hook applies. They are only live while the panel keeps arming them (ADR 8). */
export class MockEngine {
  private rules: MockRule[] = [];
  private armedUntil = 0;
  private loaded = false;
  private waiters: (() => void)[] = [];

  constructor(private readonly options: MockEngineOptions) {}

  /** Called when the panel sends rules, and again as a heartbeat. */
  arm(rules: MockRule[]): void {
    this.rules = rules;
    this.armedUntil = this.options.now() + LEASE_MS;
    this.options.hint.set(rules.some((r) => r.enabled));
    this.release();
  }

  disarm(): void {
    this.rules = [];
    this.armedUntil = 0;
    this.options.hint.set(false);
    this.release();
  }

  private get armed(): boolean {
    return this.options.now() < this.armedUntil;
  }

  match(target: MockTarget): MockRule | null {
    return this.armed ? matchRule(this.rules, target) : null;
  }

  /** Enabled rules currently applied. */
  active(): number {
    return this.armed ? this.rules.filter((r) => r.enabled).length : 0;
  }

  /**
   * Non-null while a request must wait for the panel's rules: the origin had rules armed before this
   * page load and none have arrived yet. Gives up after GATE_TIMEOUT_MS with a warning.
   */
  gate(): Promise<void> | null {
    if (this.loaded || !this.options.hint.get()) return null;
    return new Promise<void>((resolve) => {
      if (!this.waiters.length) {
        this.options.schedule(() => {
          if (this.loaded) return;
          this.options.onGateTimeout();
          this.release();
        }, GATE_TIMEOUT_MS);
      }
      this.waiters.push(resolve);
    });
  }

  private release(): void {
    this.loaded = true;
    for (const resolve of this.waiters.splice(0)) resolve();
  }
}
