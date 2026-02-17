import { defineStore } from "pinia";
import { computed } from "vue";
import { useLocalStorage } from "@vueuse/core";

export type WorkspacePov = "first" | "second" | "third";

type WorkspaceState = {
  idea: string;
  name: string;
  pov: WorkspacePov;
  lorebook: string;
  outputLanguage: string; // "auto" or a human language name
};

const defaultState: WorkspaceState = {
  idea: "",
  name: "",
  pov: "third",
  lorebook: "",
  outputLanguage: "auto",
};

export const useWorkspaceStore = defineStore("workspace", () => {
  const state = useLocalStorage<WorkspaceState>("ccg_workspace_v1", { ...defaultState });

  const idea = computed({
    get: () => state.value.idea,
    set: (value: string) => {
      state.value.idea = value;
    },
  });

  const name = computed({
    get: () => state.value.name,
    set: (value: string) => {
      state.value.name = value;
    },
  });

  const pov = computed({
    get: () => state.value.pov,
    set: (value: WorkspacePov) => {
      state.value.pov = value;
    },
  });

  const lorebook = computed({
    get: () => state.value.lorebook,
    set: (value: string) => {
      state.value.lorebook = value;
    },
  });

  const outputLanguage = computed({
    get: () => state.value.outputLanguage,
    set: (value: string) => {
      state.value.outputLanguage = value;
    },
  });

  function resetInputs() {
    state.value = { ...defaultState };
  }

  return { idea, name, pov, lorebook, outputLanguage, resetInputs };
});