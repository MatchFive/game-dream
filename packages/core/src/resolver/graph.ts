export function topologicalSort(
  nodes: string[],
  edges: Map<string, string[]>,
): string[] {
  const result: string[] = [];
  const state = new Map<string, 'white' | 'gray' | 'black'>();
  for (const node of nodes) state.set(node, 'white');

  function visit(node: string, stack: string[]): void {
    const color = state.get(node);
    if (color === 'black') return;
    if (color === 'gray') {
      throw new Error(`cycle:${[...stack, node].join(' -> ')}`);
    }
    state.set(node, 'gray');
    for (const dep of edges.get(node) ?? []) visit(dep, [...stack, node]);
    state.set(node, 'black');
    result.push(node);
  }

  for (const node of nodes) visit(node, []);
  return result;
}
