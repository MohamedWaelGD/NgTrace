import { describe, expect, it } from 'vitest';
import { diffSignals, serialiseSignalGraph, type DebugSignalGraph } from './signals';

const preview = (v: unknown) => JSON.stringify(v);

/** The shape of `ng.ɵgetSignalGraph(injector)`: a template reading `label`, which reads `id`. */
const graph = (id: number, label: unknown): DebugSignalGraph => ({
  nodes: [
    { id: '1', kind: 'template', label: 'app-resources' },
    { id: '2', kind: 'computed', label: 'label', value: label },
    { id: '3', kind: 'signal', label: 'id', value: id },
    { id: '4', kind: 'effect', label: undefined },
  ],
  edges: [
    { consumer: 0, producer: 1 },
    { consumer: 1, producer: 2 },
    { consumer: 3, producer: 2 },
  ],
});

describe('serialiseSignalGraph', () => {
  it('lists nodes with value previews and the producers each one depends on', () => {
    expect(serialiseSignalGraph(graph(1, 'Product #1'), preview)).toEqual([
      { id: '1', kind: 'template', label: 'app-resources', dependsOn: ['2'] },
      { id: '2', kind: 'computed', label: 'label', preview: '"Product #1"', dependsOn: ['3'] },
      { id: '3', kind: 'signal', label: 'id', preview: '1', dependsOn: [] },
      { id: '4', kind: 'effect', label: 'effect #4', dependsOn: ['3'] },
    ]);
  });

  it('reports a computed that was never read as not evaluated, without evaluating it', () => {
    const [, computed] = serialiseSignalGraph(graph(1, Symbol('UNSET')), preview);
    expect(computed.preview).toBeNull();
  });

  it('reports a computed that threw', () => {
    const [, computed] = serialiseSignalGraph(graph(1, Symbol('ERRORED')), preview);
    expect(computed.preview).toBe('(error)');
  });
});

describe('diffSignals', () => {
  it('names nodes whose value or dependencies changed, and added or removed nodes', () => {
    const before = serialiseSignalGraph(graph(1, 'Product #1'), preview);
    const after = serialiseSignalGraph(graph(2, 'Product #2'), preview);
    expect(diffSignals(before, after)).toEqual(['2', '3']);
    expect(diffSignals(before, before)).toEqual([]);
    expect(diffSignals(before, after.slice(0, 3))).toEqual(['2', '3', '4']);
  });
});
