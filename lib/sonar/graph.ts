// Sonar (F32): the Concept prerequisite DAG. Edges are [prerequisite, concept]. Pure, client-safe.

export type Edge = readonly [string, string];

function adjacency(edges: readonly Edge[], forward: boolean): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const [a, b] of edges) {
    const [from, to] = forward ? [a, b] : [b, a];
    m.set(from, [...(m.get(from) ?? []), to]);
  }
  return m;
}

function reach(start: string, adj: Map<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const stack = [...(adj.get(start) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(adj.get(id) ?? []));
  }
  return seen;
}

/** Every direct or indirect prerequisite of `id`. */
export function ancestors(id: string, edges: readonly Edge[]): Set<string> {
  return reach(id, adjacency(edges, false));
}

/** Every Concept that builds on `id`, directly or indirectly. */
export function descendants(id: string, edges: readonly Edge[]): Set<string> {
  return reach(id, adjacency(edges, true));
}

/** Direct prerequisites of `id`. */
export function prerequisites(id: string, edges: readonly Edge[]): string[] {
  return edges.filter(([, b]) => b === id).map(([a]) => a);
}

/** Prerequisites before dependants (Kahn). Ties keep the order of `ids`. Throws on a cycle. */
export function topoOrder(ids: readonly string[], edges: readonly Edge[]): string[] {
  const indeg = new Map(ids.map((id) => [id, 0]));
  for (const [, b] of edges) indeg.set(b, (indeg.get(b) ?? 0) + 1);
  const out = adjacency(edges, true);
  const order: string[] = [];
  const ready = ids.filter((id) => indeg.get(id) === 0);
  while (ready.length) {
    const id = ready.shift()!;
    order.push(id);
    for (const next of out.get(id) ?? []) {
      const d = indeg.get(next)! - 1;
      indeg.set(next, d);
      if (d === 0) ready.push(next);
    }
  }
  if (order.length !== indeg.size) throw new Error("Concept graph has a cycle");
  return order;
}
