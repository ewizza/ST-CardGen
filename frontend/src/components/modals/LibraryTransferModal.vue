<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { LibraryItem, LibraryRepo } from "@/services/library";

const props = defineProps<{
  modelValue: boolean;
  item: LibraryItem | null;
  fromRepoId: string;
  repos: LibraryRepo[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "confirm", payload: { toRepoId: string; mode: "copy" | "move"; destFormat: "auto" | "png" | "json" }): void;
}>();

const mode = ref<"copy" | "move">("copy");
const destFormat = ref<"auto" | "png" | "json">("auto");
const toRepoId = ref("");

const availableRepos = computed(() => props.repos.filter((repo) => repo.id !== props.fromRepoId));

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    const first = availableRepos.value[0];
    toRepoId.value = first?.id || "";
    mode.value = "copy";
    destFormat.value = "auto";
  }
);

function close() {
  emit("update:modelValue", false);
}

function confirm() {
  if (!toRepoId.value) return;
  emit("confirm", { toRepoId: toRepoId.value, mode: mode.value, destFormat: destFormat.value });
}
</script>

<template>
  <div v-if="modelValue" class="modalOverlay" @click.self="close">
    <div class="modal">
      <div class="modalHeader">
        <h3>Copy / Move</h3>
        <button class="btn-ghost" @click="close" aria-label="Close">X</button>
      </div>
      <p class="muted">Item: {{ item?.name || item?.fileBase || "Untitled" }}</p>

      <label class="field">
        <span>Destination repository</span>
        <select v-model="toRepoId">
          <option v-for="repo in availableRepos" :key="repo.id" :value="repo.id">
            {{ repo.name }}
          </option>
        </select>
      </label>

      <div class="row">
        <label class="radio">
          <input type="radio" value="copy" v-model="mode" />
          Copy
        </label>
        <label class="radio">
          <input type="radio" value="move" v-model="mode" />
          Move
        </label>
      </div>

      <label class="field">
        <span>Format</span>
        <select v-model="destFormat">
          <option value="auto">Auto</option>
          <option value="png">PNG</option>
          <option value="json">JSON</option>
        </select>
      </label>

      <div class="modalActions">
        <button class="btn-ghost" @click="close">Cancel</button>
        <button class="btn-primary" @click="confirm" :disabled="!toRepoId">Confirm</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modalOverlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9998;
  padding: 24px;
}
.modal {
  width: min(520px, 92vw);
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 16px;
  display: grid;
  gap: 12px;
}
.modalHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.field {
  display: grid;
  gap: 6px;
}
.field select {
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--border-2);
  background: var(--panel-3);
  color: var(--text);
}
.row {
  display: flex;
  gap: 16px;
  align-items: center;
}
.radio {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.modalActions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.btn-ghost {
  background: transparent;
  border: 1px solid var(--border-2);
  padding: 8px 12px;
  border-radius: 10px;
  color: var(--text);
  cursor: pointer;
}
.btn-primary {
  border: 1px solid var(--border-2);
  background: var(--accent);
  color: var(--text);
  padding: 8px 12px;
  border-radius: 10px;
  cursor: pointer;
}
.muted {
  color: var(--muted);
  font-size: 13px;
}
</style>
