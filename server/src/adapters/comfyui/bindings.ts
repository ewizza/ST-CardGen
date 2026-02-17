type Workflow = Record<string, any>;

export type Binding = { node: string; input: string };
export type BindingsMap = Record<string, Binding[]>;

export function applyBindings(workflow: Workflow, bindings: BindingsMap, values: Record<string, any>) {
  const next: Workflow = structuredClone(workflow);

  for (const [key, val] of Object.entries(values)) {
    const binds = bindings[key];
    if (!binds) continue;

    for (const b of binds) {
      if (!next[b.node]?.inputs) continue;
      next[b.node].inputs[b.input] = val;
    }
  }

  return next;
}

export function roundTo64(n: number) {
  return Math.max(64, Math.round(n / 64) * 64);
}
