import { httpJson } from "@/services/http";

export type CharacterGenerateRequest = {
  idea: string;
  name?: string;
  pov?: "first" | "second" | "third";
  lorebook?: string;
  outputLanguage?: string;
};

export type CharacterPayload = {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  tags?: string[];
  creator_notes?: string;
  image_prompt?: string;
  negative_prompt?: string;
  pov?: "first" | "second" | "third";
};

export type CharacterGenerateResponse = {
  ok: boolean;
  error?: string;
  character?: CharacterPayload;
  issues?: any;
  raw?: string;
};

export function generateCharacter(req: CharacterGenerateRequest) {
  return httpJson<CharacterGenerateResponse>("/api/character/generate", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export type FillMissingRequest = {
  card: CharacterPayload;
  lorebook?: string;
  idea?: string;
  pov?: "first" | "second" | "third";
  outputLanguage?: string;
};

export type FillMissingResponse = {
  ok: boolean;
  error?: string;
  patch?: Partial<CharacterPayload>;
  issues?: any;
  raw?: string;
};

export function fillMissing(req: FillMissingRequest) {
  return httpJson<FillMissingResponse>("/api/character/fill-missing", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export type ImagePromptRequest = {
  card: {
    name?: string;
    description?: string;
    personality?: string;
    scenario?: string;
    tags?: string[] | string;
    creator_notes?: string;
  };
  styleHints?: string;
};

export type ImagePromptResponse = {
  ok: boolean;
  error?: string;
  image_prompt?: string;
  negative_prompt?: string;
  issues?: any;
  raw?: string;
};

export function generateImagePrompt(req: ImagePromptRequest) {
  return httpJson<ImagePromptResponse>("/api/character/image-prompt", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export type RegenerateRequest = {
  idea: string;
  requestedName?: string;
  pov: "first" | "second" | "third";
  lorebook?: string;
  outputLanguage?: string;
  card: CharacterPayload;
  maxTokens?: number;
  keep: {
    name: boolean;
    description: boolean;
    personality: boolean;
    scenario: boolean;
    first_mes: boolean;
    mes_example: boolean;
    tags: boolean;
    creator_notes: boolean;
    image_prompt: boolean;
    negative_prompt: boolean;
  };
};

export type RegenerateResponse = {
  ok: boolean;
  error?: string;
  patch?: Partial<CharacterPayload>;
  issues?: any;
  raw?: string;
};

export function regenerateCharacter(req: RegenerateRequest) {
  return httpJson<RegenerateResponse>("/api/character/regenerate", {
    method: "POST",
    body: JSON.stringify(req),
  });
}
