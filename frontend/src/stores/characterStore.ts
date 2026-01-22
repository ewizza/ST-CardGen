import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { useLocalStorage } from "@vueuse/core";
import type { CharacterPayload } from "@/services/character";

type CharacterState = {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  tags: string[];
  creator_notes: string;
  image_prompt: string;
  negative_prompt: string;
  avatarUrl: string | null;
  lastSeed: number | null;
};

const initialState: CharacterState = {
  name: "",
  description: "",
  personality: "",
  scenario: "",
  first_mes: "",
  mes_example: "",
  tags: [],
  creator_notes: "",
  image_prompt: "",
  negative_prompt: "",
  avatarUrl: null,
  lastSeed: null,
};

export const useCharacterStore = defineStore("character", () => {
  const state = useLocalStorage<CharacterState>("ccg_character_v1", { ...initialState });
  const libraryId = ref<string | null>(null);
  const libraryRepoId = ref<string | null>(null);

  function field<K extends keyof CharacterState>(key: K) {
    return computed({
      get: () => state.value[key],
      set: (value: CharacterState[K]) => { state.value[key] = value; },
    });
  }

  const name = field("name");
  const description = field("description");
  const personality = field("personality");
  const scenario = field("scenario");
  const first_mes = field("first_mes");
  const mes_example = field("mes_example");
  const tags = field("tags");
  const creator_notes = field("creator_notes");
  const image_prompt = field("image_prompt");
  const negative_prompt = field("negative_prompt");
  const avatarUrl = field("avatarUrl");
  const lastSeed = field("lastSeed");

  function applyGenerated(payload: CharacterPayload) {
    state.value = {
      ...state.value,
      ...payload,
      tags: payload.tags ?? [],
      creator_notes: payload.creator_notes ?? "",
      image_prompt: payload.image_prompt ?? "",
      negative_prompt: payload.negative_prompt ?? "",
    };
  }

  function applyCardData(data: any) {
    const normalizeMes = (value: any) =>
      Array.isArray(value) ? value.join("\n\n") : typeof value === "string" ? value : "";
    const normalizeTags = (value: unknown): string[] => {
      if (!value) return [];
      if (Array.isArray(value)) {
        return value
          .filter((tag) => typeof tag === "string")
          .map((tag) => tag.trim())
          .filter(Boolean);
      }
      if (typeof value === "string") {
        return value.split(",").map((tag) => tag.trim()).filter(Boolean);
      }
      return [];
    };

    state.value = {
      ...state.value,
      name: String(data?.name ?? ""),
      description: String(data?.description ?? ""),
      personality: String(data?.personality ?? ""),
      scenario: String(data?.scenario ?? ""),
      first_mes: String(data?.first_mes ?? ""),
      mes_example: normalizeMes(data?.mes_example),
      tags: normalizeTags(data?.tags),
      creator_notes: String(data?.creator_notes ?? ""),
      image_prompt: String(data?.image_prompt ?? ""),
      negative_prompt: String(data?.negative_prompt ?? ""),
    };
  }

  function reset() {
    state.value = { ...initialState };
    libraryId.value = null;
    libraryRepoId.value = null;
  }

  function setLibraryId(id: string | null) {
    libraryId.value = id;
  }

  function setLibraryContext(repoId: string | null, id: string | null) {
    libraryRepoId.value = repoId;
    libraryId.value = id;
  }

  return {
    name,
    description,
    personality,
    scenario,
    first_mes,
    mes_example,
    tags,
    creator_notes,
    image_prompt,
    negative_prompt,
    avatarUrl,
    lastSeed,
    libraryId,
    libraryRepoId,
    setLibraryId,
    setLibraryContext,
    applyGenerated,
    applyCardData,
    reset,
  };
});
