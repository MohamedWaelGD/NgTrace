/** Signals in Live Values: a component's signal graph, read with `ng.ɵgetSignalGraph` (dev builds). */

/** What `ng.ɵgetSignalGraph(injector)` returns (Angular 20+): edges index into `nodes`. */
export interface DebugSignalGraph {
  nodes: { id: string; kind: string; label?: string; value?: unknown }[];
  edges: { consumer: number; producer: number }[];
}

export interface SignalNode {
  id: string;
  /** Debug name, else `<kind> #<id>`. */
  label: string;
  /** `signal`, `computed`, `linkedSignal`, `effect`, `template`... as Angular reports it. */
  kind: string;
  /** Value preview for value-holding nodes; null for a computed that was never evaluated. Absent for effects and templates. */
  preview?: string | null;
  /** Ids of the producers this node read in its last run. */
  dependsOn: string[];
}

const VALUE_KINDS = new Set(['signal', 'computed', 'linkedSignal', 'input']);

/** Angular's internal sentinels for a computed without a usable value (never forced to evaluate). */
function sentinel(value: unknown): 'unset' | 'error' | null {
  if (typeof value !== 'symbol') return null;
  const name = value.description;
  if (name === 'UNSET' || name === 'COMPUTING') return 'unset';
  if (name === 'ERRORED') return 'error';
  return null;
}

export function serialiseSignalGraph(graph: DebugSignalGraph, preview: (value: unknown) => string): SignalNode[] {
  const dependsOn = graph.nodes.map(() => [] as string[]);
  for (const { consumer, producer } of graph.edges) {
    const target = graph.nodes[producer];
    if (dependsOn[consumer] && target) dependsOn[consumer].push(target.id);
  }
  return graph.nodes.map((n, i) => {
    const node: SignalNode = { id: n.id, kind: n.kind, label: n.label || `${n.kind} #${n.id}`, dependsOn: dependsOn[i] };
    if (VALUE_KINDS.has(n.kind) && 'value' in n) {
      const state = sentinel(n.value);
      node.preview = state === 'unset' ? null : state === 'error' ? '(error)' : preview(n.value);
    }
    return node;
  });
}

/** Ids of nodes whose value or dependencies changed between two reads, plus added and removed nodes. */
export function diffSignals(before: readonly SignalNode[], after: readonly SignalNode[]): string[] {
  const key = (n: SignalNode) => `${n.preview === undefined ? '' : String(n.preview)}\u0000${n.dependsOn.join(',')}`;
  const old = new Map(before.map((n) => [n.id, key(n)]));
  const changed: string[] = [];
  for (const n of after) {
    if (old.get(n.id) !== key(n)) changed.push(n.id);
    old.delete(n.id);
  }
  return [...changed, ...old.keys()];
}
