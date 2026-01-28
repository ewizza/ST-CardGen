import { buildFieldDetailLines, type FieldDetailSettings, type FieldKey } from "./fieldDetail.js";

function normalizeOutputLanguage(lang?: string): string | null {
  const value = (lang ?? "").trim();
  if (!value) return null;
  if (value.toLowerCase() === "auto") return null;
  return value;
}

export type CharacterGenInput = {
  idea: string;
  name?: string;
  pov: "first" | "second" | "third";
  lorebook?: string;
  outputLanguage?: string;
};

export function buildCharacterGenPrompt(
  input: CharacterGenInput,
  options: {
    contentRating: "sfw" | "nsfw_allowed";
    fieldDetail?: FieldDetailSettings;
    useDefaultNegativePrompt?: boolean;
  }
) {
  const nameLine = input.name?.trim()
    ? `Preferred name: ${input.name.trim()}`
    : "Preferred name: (invent a fitting name)";
  const loreLine = input.lorebook?.trim()
    ? `Lorebook:\n${input.lorebook.trim()}`
    : "Lorebook: (none)";
  const lang = normalizeOutputLanguage(input.outputLanguage);

  const useDefaultNegativePrompt = options.useDefaultNegativePrompt === true;
  const jsonKeys = useDefaultNegativePrompt
    ? "name, description, personality, scenario, first_mes, mes_example, tags, creator_notes, image_prompt, pov"
    : "name, description, personality, scenario, first_mes, mes_example, tags, creator_notes, image_prompt, negative_prompt, pov";

  return [
    "You are generating a SillyTavern character card.",
    "Return ONLY valid JSON. No markdown, no commentary.",
    "Rules:",
    ...(lang ? [
      "LANGUAGE REQUIREMENT (CRITICAL):",
      `- Write ALL field values in ${lang} (do not mix languages).`,
      "- Keep proper names as names, but everything else must be in the selected language.",
      "- Avoid English filler words (e.g., 'but', 'and', 'so') in non-English text.",
      "- Always write image_prompt and negative_prompt in English.",
      "",
    ] : []),
    "- Output must be a single JSON object with keys exactly:",
    `  ${jsonKeys}`,
    "- Use standard JSON escaping for newlines (\\n). No trailing commas.",
    "- tags must be an array of short strings.",
    "- image_prompt must be a concise, detailed portrait prompt for the avatar.",
    "- image_prompt: English, exactly ONE paragraph, 350–500 characters max, no newlines.",
    ...(useDefaultNegativePrompt ? [
      "- Do NOT output negative_prompt; the app will supply it.",
    ] : [
      "- negative_prompt should list what to avoid.",
      "- negative_prompt: English, single line, comma-separated phrases, 200–300 characters max, no newlines.",
    ]),
    "- If you exceed limits, rewrite shorter before responding.",
    "- Do not use quotes or markdown in image_prompt/negative_prompt.",
    "- mes_example must use {{user}} and {{char}} labels.",
    options.contentRating === "sfw"
      ? "Content rating: SFW only. Keep content safe and avoid sexual content."
      : "Content rating: NSFW allowed. Do not add safety constraints unless requested; focus negative_prompt on quality/artifacts.",
    ...(useDefaultNegativePrompt
      ? []
      : [
          options.contentRating === "sfw"
            ? "- negative_prompt must include nudity and explicit sexual content to avoid."
            : "- negative_prompt should focus on quality/artifacts unless the user requests otherwise.",
        ]),
    "POV rules for first_mes:",
    "- first: {{char}} speaks in first person.",
    "- second: address {{user}} in second person without controlling their actions.",
    "- third: write in third person, acknowledge {{user}} presence without controlling them.",
    "",
    "FIELD LENGTH & STRUCTURE PRESET (MANDATORY):",
    ...buildFieldDetailLines(options.fieldDetail, [
      "description",
      "personality",
      "scenario",
      "first_mes",
      "mes_example",
      "creator_notes",
      "tags",
    ] as FieldKey[]),
    "",
    "FIRST MESSAGE (first_mes) QUALITY BAR (MANDATORY):",
    "- first_mes MUST read like the opening of a story scene, not a greeting.",
    "- Length & structure: follow the Field Length preset above for first_mes.",
    "- Start in medias res with concrete sensory detail and immediate context (place/time/weather/sounds).",
    "- Show {{char}} doing something *right now* (actions, body language, small beats) before/around dialogue.",
    "- Include at least ONE spoken line from {{char}} (quoted dialogue).",
    "- Acknowledge {{user}}’s presence naturally, but DO NOT narrate {{user}}’s thoughts, feelings, or decisions.",
    "- You MAY establish a minimal premise for {{user}} entering the scene (arriving, noticing, standing there),",
    "  but do not force choices or internal monologue onto {{user}}.",
    "- End with a HOOK that demands a response (a question, an urgent request, a reveal, or an interrupting event).",
    "- Avoid generic openers like: 'Greetings', 'Hello', 'How may I help', 'Welcome'.",
    "- Do not include meta commentary (no 'as an AI', no writing notes).",
    "",
    "If you cannot comply with JSON, return ONLY the tagged template below and nothing else:",
    "#NAME#",
    "#DESCRIPTION#",
    "#PERSONALITY#",
    "#SCENARIO#",
    "#FIRST_MESSAGE#",
    "#EXAMPLE_MESSAGES#",
    "#TAGS#",
    "#CREATOR_NOTES#",
    "#IMAGE_PROMPT#",
    ...(useDefaultNegativePrompt ? [] : ["#NEGATIVE_PROMPT#"]),
    "#POV#",
    "",
    "Input:",
    `Idea: ${input.idea.trim()}`,
    nameLine,
    `POV: ${input.pov}`,
    loreLine,
  ].join("\n");
}

type FillMissingInput = {
  card: Record<string, any>;
  missingKeys: string[];
  pov: "first" | "second" | "third";
  idea?: string;
  lorebook?: string;
  outputLanguage?: string;
};

export function buildFillMissingPrompt(input: FillMissingInput, options?: { fieldDetail?: FieldDetailSettings }) {
  const fields = JSON.stringify(input.card, null, 2);
  const loreLine = input.lorebook?.trim()
    ? `Lorebook:\n${input.lorebook.trim()}`
    : "Lorebook: (none)";
  const ideaLine = input.idea?.trim() ? `Idea: ${input.idea.trim()}` : "Idea: (none)";
  const missingFieldKeys = input.missingKeys.filter((k) =>
    ["description", "personality", "scenario", "first_mes", "mes_example", "creator_notes", "tags"].includes(k)
  ) as FieldKey[];
  const needsFirstMes = missingFieldKeys.includes("first_mes");
  const lang = normalizeOutputLanguage(input.outputLanguage);

  return [
    "You are completing missing fields for a SillyTavern character card.",
    "Return ONLY valid JSON. No markdown, no commentary.",
    "Rules:",
    ...(lang ? [
      "LANGUAGE REQUIREMENT (CRITICAL):",
      `- Write ALL field values in ${lang} (do not mix languages).`,
      "- Keep proper names as names, but everything else must be in the selected language.",
      "- Avoid English filler words (e.g., 'but', 'and', 'so') in non-English text.",
      "- Always write image_prompt and negative_prompt in English.",
      "",
    ] : []),
    "- Output must be a JSON object containing ONLY the missing keys listed below.",
    "- Do NOT include keys that already have content.",
    "- Use standard JSON escaping for newlines (\\n). No trailing commas.",
    "- mes_example must use {{user}} and {{char}} labels if requested.",
    "POV rules for first_mes:",
    "- first: {{char}} speaks in first person.",
    "- second: address {{user}} in second person without controlling their actions.",
    "- third: write in third person, acknowledge {{user}} presence without controlling them.",
    "",
    "FIELD LENGTH & STRUCTURE PRESET (MANDATORY):",
    ...buildFieldDetailLines(options?.fieldDetail, missingFieldKeys),
    "",
    ...(needsFirstMes
      ? [
          "If first_mes is among the missing keys, apply these FIRST MESSAGE requirements:",
          "- first_mes MUST read like the opening of a story scene, not a greeting.",
          "- Length & structure: follow the Field Length preset above for first_mes.",
          "- Start in medias res with concrete sensory detail and immediate context (place/time/weather/sounds).",
          "- Show {{char}} doing something *right now* (actions, body language, small beats) before/around dialogue.",
          "- Include at least ONE spoken line from {{char}} (quoted dialogue).",
          "- Acknowledge {{user}} without controlling their thoughts/choices.",
          "- End with a HOOK that demands a response (a question, an urgent request, a reveal, or an interrupting event).",
          "- Avoid generic openers like: 'Greetings', 'Hello', 'How may I help', 'Welcome'.",
          "- Do not include meta commentary (no 'as an AI', no writing notes).",
          "",
        ]
      : []),
    "Missing keys:",
    input.missingKeys.join(", "),
    "",
    "Existing fields:",
    fields,
    ideaLine,
    `POV: ${input.pov}`,
    loreLine,
  ].join("\n");
}

type ImagePromptInput = {
  card: Record<string, any>;
  styleHints?: string;
};

export function buildImagePrompt(
  input: ImagePromptInput & {
    contentRating: "sfw" | "nsfw_allowed";
    useDefaultNegativePrompt?: boolean;
  }
) {
  const fields = JSON.stringify(input.card, null, 2);
  const styleLine = input.styleHints?.trim()
    ? `Style hints: ${input.styleHints.trim()}`
    : "Style hints: (none)";
  const useDefaultNegativePrompt = input.useDefaultNegativePrompt === true;

  return [
    "You are generating an avatar portrait prompt for a SillyTavern character.",
    useDefaultNegativePrompt
      ? "Return ONLY valid JSON with keys: image_prompt."
      : "Return ONLY valid JSON with keys: image_prompt, negative_prompt.",
    "Rules:",
    "- image_prompt must be a concise, detailed portrait prompt.",
    ...(useDefaultNegativePrompt ? [] : ["- negative_prompt should list what to avoid."]),
    "- image_prompt: English, exactly ONE paragraph, 350-500 characters max, no newlines.",
    ...(useDefaultNegativePrompt ? [] : [
      "- negative_prompt: English, single line, comma-separated phrases, 200-300 characters max, no newlines.",
    ]),
    "- If you exceed limits, rewrite shorter before responding.",
    "- Do not use quotes or markdown in image_prompt/negative_prompt.",
    input.contentRating === "sfw"
      ? (useDefaultNegativePrompt
        ? "Content rating: SFW only. Keep content safe and avoid sexual content."
        : "Content rating: SFW only. Include nudity and explicit sexual content in negative_prompt.")
      : "Content rating: NSFW allowed. Do not add safety constraints unless requested; focus negative_prompt on quality/artifacts.",
    "- Use standard JSON escaping for newlines (\\n). No trailing commas.",
    "",
    "Character fields:",
    fields,
    styleLine,
  ].join("\\n");
}

type RegenerateInput = {
  idea: string;
  requestedName?: string;
  pov: "first" | "second" | "third";
  lorebook?: string;
  card: Record<string, any>;
  targets: string[];
  regenNonce?: string;
  outputLanguage?: string;
};

export function buildRegeneratePrompt(input: RegenerateInput, options?: { fieldDetail?: FieldDetailSettings }) {
  const nameLine = input.requestedName?.trim()
    ? `Preferred name: ${input.requestedName.trim()}`
    : "Preferred name: (unchanged)";
  const nameRule = input.requestedName?.trim()
    ? "If you update name, use the preferred name exactly unless you must adjust capitalization."
    : "";
  const loreLine = input.lorebook?.trim()
    ? `Lorebook:\n${input.lorebook.trim()}`
    : "Lorebook: (none)";
  const targetFieldKeys = input.targets.filter((k) =>
    ["description", "personality", "scenario", "first_mes", "mes_example", "creator_notes", "tags"].includes(k)
  ) as FieldKey[];
  const needsFirstMes = targetFieldKeys.includes("first_mes");
  const lang = normalizeOutputLanguage(input.outputLanguage);

  return [
    "You are regenerating selected fields for a SillyTavern character card.",
    "Return ONLY valid JSON. No markdown, no commentary.",
    "Rules:",
    ...(lang ? [
      "LANGUAGE REQUIREMENT (CRITICAL):",
      `- Write ALL field values in ${lang} (do not mix languages).`,
      "- Keep proper names as names, but everything else must be in the selected language.",
      "- Avoid English filler words (e.g., 'but', 'and', 'so') in non-English text.",
      "- Always write image_prompt and negative_prompt in English.",
      "",
    ] : []),
    "- Output must be a JSON object containing ONLY the target keys listed below.",
    "- Do NOT include keys that are not in the target list.",
    "- Use standard JSON escaping for newlines (\\n). No trailing commas.",
    "- mes_example must use {{user}} and {{char}} labels if requested.",
    nameRule,
    "Regeneration rules (MANDATORY):",
    "- You are regenerating the target keys ONLY.",
    "- For each target key, produce a NEW value that is not identical to the existing value for that key.",
    "- Do NOT return the exact same text/array as the existing value for that key.",
    "- If you accidentally repeat a target value, regenerate internally until it differs.",
    "Regeneration nonce (use to vary phrasing/details; do not output it):",
    input.regenNonce ?? "(none)",
    "",
    "POV rules for first_mes:",
    "- first: {{char}} speaks in first person.",
    "- second: address {{user}} in second person without controlling their actions.",
    "- third: write in third person, acknowledge {{user}} presence without controlling them.",
    "",
    "FIELD LENGTH & STRUCTURE PRESET (MANDATORY):",
    ...buildFieldDetailLines(options?.fieldDetail, targetFieldKeys),
    "",
    ...(needsFirstMes
      ? [
          "If first_mes is among the target keys, apply these FIRST MESSAGE requirements:",
          "- first_mes MUST read like the opening of a story scene, not a greeting.",
          "- Length & structure: follow the Field Length preset above for first_mes.",
          "- Start in medias res with concrete sensory detail and immediate context (place/time/weather/sounds).",
          "- Show {{char}} doing something *right now* (actions, body language, small beats) before/around dialogue.",
          "- Include at least ONE spoken line from {{char}} (quoted dialogue).",
          "- Acknowledge {{user}} without controlling their thoughts/choices.",
          "- End with a HOOK that demands a response (a question, an urgent request, a reveal, or an interrupting event).",
          "- Avoid generic openers like: 'Greetings', 'Hello', 'How may I help', 'Welcome'.",
          "- Do not include meta commentary (no 'as an AI', no writing notes).",
          "",
        ]
      : []),
    "Target keys:",
    input.targets.join(", "),
    "",
    "Existing fields:",
    JSON.stringify(input.card, null, 2),
    "",
    "Input:",
    `Idea: ${input.idea.trim()}`,
    nameLine,
    `POV: ${input.pov}`,
    loreLine,
  ].join("\n");
}
