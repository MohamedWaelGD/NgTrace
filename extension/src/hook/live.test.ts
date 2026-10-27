import { describe, expect, it } from 'vitest';
import type { LiveUpdate, SignalNode } from '@ngtrace/protocol';
import { LiveValues } from './live';

const node = (id: string, preview: string | null, dependsOn: string[] = []): SignalNode => ({ id, kind: 'signal', label: id, preview, dependsOn });

function setup() {
  let signals: SignalNode[] = [node('1', '1')];
  const posted: LiveUpdate[] = [];
  const live = new LiveValues(
    { inputs: () => [], entries: () => [], isGone: () => false, signals: () => signals },
    (u) => posted.push(u),
    (fn) => fn(),
  );
  live.follow({ kind: 'component', id: 7 }, []);
  return { live, posted, setSignals: (s: SignalNode[]) => (signals = s) };
}

describe('LiveValues: signals', () => {
  it('posts the signal graph only when a node changed, naming the changed nodes', () => {
    const { live, posted, setSignals } = setup();
    live.changeDetected();
    expect(posted).toEqual([]);

    setSignals([node('1', '2')]);
    live.changeDetected();
    expect(posted).toHaveLength(1);
    expect(posted[0].signals).toEqual([node('1', '2')]);
    expect(posted[0].changedSignals).toEqual(['1']);
  });
});
