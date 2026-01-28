import { CharacterGenSchema, type CharacterGen } from "./schema.js";

const TAGS = [
  "NAME",
  "DESCRIPTION",
  "PERSONALITY",
  "SCENARIO",
  "FIRST_MESSAGE",
  "EXAMPLE_MESSAGES",
  "TAGS",
  "CREATOR_NOTES",
  "IMAGE_PROMPT",
  "NEGATIVE_PROMPT",
  "POV",
];

const TAG_SET = new Set(TAGS);

export function extractJsonBlock(raw: string): string | null {
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/i);
  if (jsonMatch) return jsonMatch[1].trim();
  const genericMatch = raw.match(/```\s*([\s\S]*?)```/);
  return genericMatch ? genericMatch[1].trim() : null;
}

export function extractFirstBalancedJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;

  let inString = false;
  let escape = false;
  let depth = 0;

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === "\"") {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) return raw.slice(start, i + 1);
      }
    }
  }
  return null;
}

export function tryParseJson(raw: string): any | null {
  const candidates: string[] = [];
  const block = extractJsonBlock(raw);
  if (block) candidates.push(block);
  const balanced = extractFirstBalancedJsonObject(raw);
  if (balanced) candidates.push(balanced);
  candidates.push(raw.trim());

  for (const candidate of candidates) {
    const trimmed = candidate.replace(/^\uFEFF/, "").trim();
    if (!trimmed) continue;
    try {
      return JSON.parse(trimmed);
    } catch {
      // try next candidate
    }
  }
  return null;
}

export function parseTaggedSections(raw: string): Record<string, string> {
  const map: Record<string, string> = {};
  let current: string | null = null;
  let buffer: string[] = [];

  function flush() {
    if (current) {
      map[current] = buffer.join("\n").trim();
    }
    buffer = [];
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    const match = trimmed.match(/^#([A-Z_]+)#$/);
    if (match && TAG_SET.has(match[1])) {
      flush();
      current = match[1];
      continue;
    }
    if (current) buffer.push(line);
  }
  flush();

  return map;
}

function parseTags(value: string) {
  return value
    .split(/,|\n/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizePov(value: string | undefined) {
  const pov = (value ?? "").trim().toLowerCase();
  if (pov === "first" || pov === "second" || pov === "third") return pov;
  return undefined;
}

export function buildCharacterFromTaggedSections(map: Record<string, string>) {
  const get = (key: string) => (map[key] ?? "").trim();
  const pov = normalizePov(map.POV);

  const result: any = {
    name: get("NAME"),
    description: get("DESCRIPTION"),
    personality: get("PERSONALITY"),
    scenario: get("SCENARIO"),
    first_mes: get("FIRST_MESSAGE"),
    mes_example: get("EXAMPLE_MESSAGES"),
    tags: parseTags(map.TAGS ?? ""),
    creator_notes: get("CREATOR_NOTES"),
    image_prompt: get("IMAGE_PROMPT"),
    negative_prompt: get("NEGATIVE_PROMPT"),
  };

  if (pov) result.pov = pov;
  return result;
}

export function parseCharacterResponse(raw: string): CharacterGen {
  const json = tryParseJson(raw);
  if (json) {
    const validated = CharacterGenSchema.safeParse(json);
    if (!validated.success) {
      throw new Error("LLM JSON did not match schema");
    }
    return validated.data;
  }

  const sections = parseTaggedSections(raw);
  if (!Object.keys(sections).length) {
    throw new Error("Unable to parse LLM response as JSON or tagged sections");
  }

  const built = buildCharacterFromTaggedSections(sections);
  const validated = CharacterGenSchema.safeParse(built);
  if (!validated.success) {
    throw new Error("Tagged response did not match schema");
  }
  return validated.data;
}
