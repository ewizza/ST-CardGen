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

function extractLikelyJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
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

      // Normalize literal CR/LF inside strings into \n
      if (c === "\r") {
        // swallow \r (and let \n handle on next char if present)
        continue;
      }
      if (c === "\n") {
        out += "\\n";
        continue;
      }

      out += c;
      continue;
    }

    // not in string
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
  // 1) slice most likely object if extra text exists
  const obj = extractLikelyJsonObject(text) ?? text;

  // 2) escape multiline strings
  const escaped = escapeNewlinesInJsonStrings(obj);

  // 3) strip trailing commas
  return stripTrailingCommas(escaped).trim();
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
    try {
      return JSON.parse(candidate);
    } catch {
      // try repair
    }
    try {
      return JSON.parse(repairJsonCandidate(candidate));
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
      throw new Error(`LLM JSON did not match schema: ${validated.error.issues[0]?.message ?? "invalid"}`);
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
