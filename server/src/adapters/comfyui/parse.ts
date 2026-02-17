type AnyObj = Record<string, any>;

/**
 * ComfyUI /object_info structure varies by version and installed nodes.
 * We keep parsing defensive and return best-effort lists.
 */
export function extractStringOptions(objectInfo: AnyObj, nodeName: string, inputName: string): string[] {
  const node = objectInfo?.[nodeName];
  const required = node?.input?.required;
  const entry = required?.[inputName];

  // Common patterns:
  // 1) ["STRING", { default: "...", ... }]
  // 2) [["a","b","c"], { ... }]
  // 3) [{...}] etc.
  if (!entry || !Array.isArray(entry)) return [];

  const first = entry[0];

  // If first is an array of options:
  if (Array.isArray(first)) {
    return first.filter((x) => typeof x === "string") as string[];
  }

  // Some nodes use "STRING" with no options
  return [];
}

export function extractSamplers(objectInfo: AnyObj): string[] {
  return extractStringOptions(objectInfo, "KSampler", "sampler_name");
}

export function extractSchedulers(objectInfo: AnyObj): string[] {
  return extractStringOptions(objectInfo, "KSampler", "scheduler");
}

export function extractCheckpointModels(objectInfo: AnyObj): string[] {
  // Most common node names for checkpoints:
  const candidates = [
    { node: "CheckpointLoaderSimple", input: "ckpt_name" },
    { node: "CheckpointLoader", input: "ckpt_name" }
  ];

  for (const c of candidates) {
    const opts = extractStringOptions(objectInfo, c.node, c.input);
    if (opts.length) return opts;
  }
  return [];
}

export function extractLoras(objectInfo: AnyObj): string[] {
  // Most common LoRA loader node name:
  const candidates = [
    { node: "LoraLoader", input: "lora_name" },
    { node: "LoRALoader", input: "lora_name" } // some custom packs
  ];

  for (const c of candidates) {
    const opts = extractStringOptions(objectInfo, c.node, c.input);
    if (opts.length) return opts;
  }
  return [];
}
