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

const JSONISH_KEYS = [
  "name",
  "description",
  "personality",
  "scenario",
  "first_mes",
  "mes_example",
  "tags",
  "creator_notes",
  "image_prompt",
  "negative_prompt",
  "pov",
] as const;

function extractLikelyJsonObject(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) return text.trim();
  const end = text.lastIndexOf("}");
  if (end === -1 || end <= start) return text.slice(start).trim();
  return text.slice(start, end + 1).trim();
}

function escapeNewlinesInJsonStrings(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (escaped) {
      out += c;
      escaped = false;
      continue;
    }

    if (inString) {
      if (c === "\\") {
        out += c;
        escaped = true;
        continue;
      }
      if (c === "\"") {
        out += c;
        inString = false;
        continue;
      }
      if (c === "\r") continue;
      if (c === "\n") {
        out += "\\n";
        continue;
      }
      out += c;
      continue;
    }

    if (c === "\"") {
      out += c;
      inString = true;
      continue;
    }
    out += c;
  }

  return out;
}

function stripTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, "$1");
}

function repairJsonCandidate(text: string): string {
  const sliced = extractLikelyJsonObject(text);
  const escaped = escapeNewlinesInJsonStrings(sliced);
  return stripTrailingCommas(escaped).trim();
}

function findNextKeyIndex(src: string, from: number): number {
  let best = -1;
  for (const k of JSONISH_KEYS) {
    const idx = src.indexOf(`\"${k}\"`, from);
    if (idx !== -1 && (best === -1 || idx < best)) best = idx;
  }
  return best;
}

function unquoteLoose(raw: string): string {
  let s = raw.trim().replace(/,\s*$/, "");
  if (s.startsWith("\"")) {
    s = s.slice(1);
    const lastQuote = s.lastIndexOf("\"");
    if (lastQuote !== -1) s = s.slice(0, lastQuote);
  }
  // normalize + unescape common sequences
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  s = s.replace(/\\n/g, "\n").replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
  return s.trim();
}

function parseJsonishTags(chunk: string): string[] {
  const s = chunk.trim().replace(/,\s*$/, "");
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  const region = start !== -1 ? s.slice(start + 1, end !== -1 ? end : s.length) : s;

  const matches = Array.from(region.matchAll(/\"([^\"]+)\"/g))
    .map((m) => m[1].trim())
    .filter(Boolean);
  if (matches.length) return matches;

  return region.split(/,|\n/).map((t) => t.trim().replace(/^\"|\"$/g, "")).filter(Boolean);
}

function extractJsonishObject(raw: string): Record<string, any> | null {
  const src = extractLikelyJsonObject(raw);

  // Require at least two required fields so we don't parse random blobs
  const requiredHits =
    (src.includes("\"name\"") ? 1 : 0) +
    (src.includes("\"description\"") ? 1 : 0) +
    (src.includes("\"personality\"") ? 1 : 0) +
    (src.includes("\"scenario\"") ? 1 : 0) +
    (src.includes("\"first_mes\"") ? 1 : 0);

  if (requiredHits < 2) return null;

  const out: Record<string, any> = {};

  for (const key of JSONISH_KEYS) {
    const keyIdx = src.indexOf(`\"${key}\"`);
    if (keyIdx === -1) continue;

    const colonIdx = src.indexOf(":", keyIdx);
    if (colonIdx === -1) continue;

    let valueStart = colonIdx + 1;
    while (valueStart < src.length && /\s/.test(src[valueStart])) valueStart++;

    const nextKeyIdx = findNextKeyIndex(src, valueStart);
    const valueEnd = nextKeyIdx === -1 ? src.length : nextKeyIdx;

    const chunk = src.slice(valueStart, valueEnd).trim();

    if (key === "tags") {
      out.tags = parseJsonishTags(chunk);
      continue;
    }
    out[key] = unquoteLoose(chunk);
  }

  if (out.mes_example === undefined) out.mes_example = "";
  return out;
}

export function extractJsonBlock(raw: string): string | null {
  const match = raw.match(/```json\s*([\s\S]*?)```/i);
  return match ? match[1].trim() : null;
}

export function tryParseJson(raw: string): any | null {
  const candidates: string[] = [];
  const block = extractJsonBlock(raw);
  if (block) candidates.push(block);
  candidates.push(raw.trim());

  for (const candidate of candidates) {
    if (!candidate) continue;
    try { return JSON.parse(candidate); } catch {}
    try { return JSON.parse(repairJsonCandidate(candidate)); } catch {}

    const jsonish = extractJsonishObject(candidate);
    if (jsonish) return jsonish;
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
