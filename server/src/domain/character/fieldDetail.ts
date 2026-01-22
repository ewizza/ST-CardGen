export type FieldDetailProfile = "short" | "detailed" | "verbose";

export type FieldOverrideMode = "inherit" | FieldDetailProfile;

export type FieldKey =
  | "description"
  | "personality"
  | "scenario"
  | "first_mes"
  | "mes_example"
  | "creator_notes"
  | "tags";

export type FieldDetailSettings = {
  profile: FieldDetailProfile;
  overrides?: Partial<Record<FieldKey, FieldOverrideMode>>;
};

type FieldSpec = {
  wordsMin?: number;
  wordsMax?: number;
  paragraphsMin?: number;
  paragraphsMax?: number;
  minChars?: number;
  exchangesMin?: number;
  exchangesMax?: number;
  tagsMin?: number;
  tagsMax?: number;
};

const PROFILE_SPECS: Record<FieldDetailProfile, Record<FieldKey, FieldSpec>> = {
  short: {
    description: { wordsMin: 120, wordsMax: 190, paragraphsMin: 1, paragraphsMax: 1 },
    personality: { wordsMin: 90, wordsMax: 150, paragraphsMin: 1, paragraphsMax: 1 },
    scenario: { wordsMin: 90, wordsMax: 150, paragraphsMin: 1, paragraphsMax: 1 },
    first_mes: { wordsMin: 150, wordsMax: 240, paragraphsMin: 2, paragraphsMax: 3, minChars: 700 },
    mes_example: { exchangesMin: 1, exchangesMax: 2 },
    creator_notes: { wordsMin: 50, wordsMax: 120, paragraphsMin: 1, paragraphsMax: 1 },
    tags: { tagsMin: 4, tagsMax: 8 },
  },
  detailed: {
    description: { wordsMin: 220, wordsMax: 360, paragraphsMin: 1, paragraphsMax: 2 },
    personality: { wordsMin: 160, wordsMax: 260, paragraphsMin: 1, paragraphsMax: 2 },
    scenario: { wordsMin: 160, wordsMax: 240, paragraphsMin: 1, paragraphsMax: 2 },
    first_mes: { wordsMin: 220, wordsMax: 360, paragraphsMin: 3, paragraphsMax: 5, minChars: 900 },
    mes_example: { exchangesMin: 2, exchangesMax: 3 },
    creator_notes: { wordsMin: 120, wordsMax: 220, paragraphsMin: 1, paragraphsMax: 2 },
    tags: { tagsMin: 6, tagsMax: 10 },
  },
  verbose: {
    description: { wordsMin: 360, wordsMax: 560, paragraphsMin: 2, paragraphsMax: 3 },
    personality: { wordsMin: 260, wordsMax: 420, paragraphsMin: 2, paragraphsMax: 3 },
    scenario: { wordsMin: 240, wordsMax: 420, paragraphsMin: 2, paragraphsMax: 3 },
    first_mes: { wordsMin: 360, wordsMax: 560, paragraphsMin: 4, paragraphsMax: 6, minChars: 1200 },
    mes_example: { exchangesMin: 3, exchangesMax: 5 },
    creator_notes: { wordsMin: 200, wordsMax: 360, paragraphsMin: 2, paragraphsMax: 3 },
    tags: { tagsMin: 8, tagsMax: 12 },
  },
};

function isProfile(value: any): value is FieldDetailProfile {
  return value === "short" || value === "detailed" || value === "verbose";
}

export function effectiveProfile(settings: FieldDetailSettings | undefined, field: FieldKey): FieldDetailProfile {
  const global = isProfile(settings?.profile) ? settings!.profile : "detailed";
  const override = settings?.overrides?.[field];
  if (isProfile(override)) return override;
  return global;
}

export function specFor(settings: FieldDetailSettings | undefined, field: FieldKey): FieldSpec {
  const profile = effectiveProfile(settings, field);
  return PROFILE_SPECS[profile][field];
}

function range(min?: number, max?: number) {
  if (min == null && max == null) return "";
  if (min != null && max != null) return `${min}–${max}`;
  if (min != null) return `≥${min}`;
  return `≤${max}`;
}

function fmtWords(spec: FieldSpec) {
  const r = range(spec.wordsMin, spec.wordsMax);
  return r ? `${r} words` : "";
}

function fmtParagraphs(spec: FieldSpec) {
  const r = range(spec.paragraphsMin, spec.paragraphsMax);
  return r ? `${r} paragraphs` : "";
}

function fmtMinChars(spec: FieldSpec) {
  return spec.minChars ? `min ${spec.minChars} characters` : "";
}

function joinParts(parts: string[]) {
  return parts.filter(Boolean).join(", ");
}

export function buildFieldDetailLines(settings: FieldDetailSettings | undefined, fields: FieldKey[]) {
  const unique = Array.from(new Set(fields));
  const lines: string[] = [];

  for (const field of unique) {
    const profile = effectiveProfile(settings, field);
    const spec = specFor(settings, field);

    if (field === "mes_example") {
      const exchanges = range(spec.exchangesMin, spec.exchangesMax);
      lines.push(
        `- mes_example (${profile}): ${exchanges || "1–2"} example exchanges (each exchange is {{user}} then {{char}}). Prefer 1 string with \\n line breaks.`
      );
      continue;
    }
    if (field === "tags") {
      const tags = range(spec.tagsMin, spec.tagsMax);
      lines.push(`- tags (${profile}): JSON array of ${tags || "6–10"} short tags (1–3 words each), no duplicates.`);
      continue;
    }
    if (field === "first_mes") {
      const parts = [fmtWords(spec), fmtMinChars(spec), fmtParagraphs(spec)];
      lines.push(`- first_mes (${profile}): ${joinParts(parts)}. Use \\n\\n between paragraphs.`);
      continue;
    }

    const parts = [fmtWords(spec), fmtParagraphs(spec)];
    lines.push(`- ${field} (${profile}): ${joinParts(parts)}.`);
  }

  return lines;
}
