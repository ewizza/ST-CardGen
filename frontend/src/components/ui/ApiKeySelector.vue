<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { deleteKey, listKeys, saveKey, validateKey } from "@/services/keys";

const props = defineProps<{
  modelValue: string | null | undefined;
  provider: string;
  label?: string;
  showTest?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string | null): void;
}>();

const keys = ref<Array<{ name: string }>>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const success = ref<string | null>(null);
const warning = ref<string | null>(null);
const showAdd = ref(false);
const newName = ref("");
const newKey = ref("");
const storeSecurely = ref(false);
const testing = ref(false);
const deleting = ref(false);

const selected = computed({
  get: () => props.modelValue ?? "",
  set: (value: string) => emit("update:modelValue", value || null),
});

async function refreshKeys() {
  loading.value = true;
  error.value = null;
  try {
    const res = await listKeys();
    if (!res.ok) throw new Error(res.error || "Failed to load keys.");
    keys.value = res.keys ?? [];
  } catch (e: any) {
    error.value = String(e?.message ?? e);
  } finally {
    loading.value = false;
  }
}

async function onSaveKey() {
  error.value = null;
  success.value = null;
  warning.value = null;
  try {
    const name = newName.value.trim();
    const secret = newKey.value;
    const res = await saveKey(name, secret, storeSecurely.value);
    if (!res.ok) throw new Error(res.error || "Failed to save key.");
    newName.value = "";
    newKey.value = "";
    showAdd.value = false;
    storeSecurely.value = false;
    success.value = res.storedIn ? `Key saved (${res.storedIn}).` : "Key saved.";
    if (res.warning) warning.value = res.warning;
    await refreshKeys();
    emit("update:modelValue", name);
  } catch (e: any) {
    error.value = String(e?.message ?? e);
  }
}

async function onDeleteKey() {
  if (!selected.value) return;
  if (!window.confirm(`Delete key "${selected.value}"?`)) return;
  deleting.value = true;
  error.value = null;
  success.value = null;
  try {
    const res = await deleteKey(selected.value);
    if (!res.ok) throw new Error(res.error || "Failed to delete key.");
    if (selected.value) emit("update:modelValue", null);
    success.value = "Key deleted.";
    await refreshKeys();
  } catch (e: any) {
    error.value = String(e?.message ?? e);
  } finally {
    deleting.value = false;
  }
}

async function onTestKey() {
  if (!selected.value) return;
  testing.value = true;
  error.value = null;
  success.value = null;
  warning.value = null;
  try {
    const res = await validateKey(props.provider, selected.value);
    if (!res.ok) throw new Error(res.error || "Key validation failed.");
    success.value = res.storedIn ? `Key validated (${res.storedIn}).` : "Key validated.";
    if (res.warning) warning.value = res.warning;
  } catch (e: any) {
    error.value = String(e?.message ?? e);
  } finally {
    testing.value = false;
  }
}

onMounted(() => {
  refreshKeys();
});
</script>

<template>
  <div class="apiKey">
    <label class="field">
      <span>{{ props.label ?? "Saved key" }}</span>
      <select v-model="selected" :disabled="loading">
        <option value="">(none)</option>
        <option v-for="key in keys" :key="key.name" :value="key.name">
          {{ key.name }}
        </option>
      </select>
    </label>

    <div class="row">
      <button class="ghost" type="button" @click="showAdd = !showAdd">
        {{ showAdd ? "Cancel" : "Add key" }}
      </button>
      <button class="ghost" type="button" @click="onDeleteKey" :disabled="!selected || deleting">
        {{ deleting ? "Deleting..." : "Delete selected key" }}
      </button>
      <button
        v-if="props.showTest !== false"
        class="ghost"
        type="button"
        @click="onTestKey"
        :disabled="!selected || testing"
      >
        {{ testing ? "Testing..." : "Test key" }}
      </button>
    </div>

    <div v-if="showAdd" class="addForm">
      <label class="field">
        <span>Name</span>
        <input v-model="newName" placeholder="e.g. openai-main" />
      </label>
      <label class="field">
        <span>Key</span>
        <input v-model="newKey" type="password" placeholder="sk-..." />
      </label>
      <label class="checkbox">
        <input v-model="storeSecurely" type="checkbox" />
        <span>Store securely (OS keychain)</span>
      </label>
      <p class="muted compact">
        If secure storage is unavailable (e.g., keytar/libsecret), the backend falls back to config file storage and returns a warning.
      </p>
      <div class="row">
        <button type="button" @click="onSaveKey">Save key</button>
      </div>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="success" class="muted">{{ success }}</p>
    <p v-if="warning" class="warning">{{ warning }}</p>
  </div>
</template>

<style scoped>
.apiKey {
  display: grid;
  gap: 10px;
}
.field {
  display: grid;
  gap: 6px;
  margin: 6px 0;
}
.field select,
.field input {
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--border-2);
  background: var(--panel-3);
  color: var(--text);
}
.row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.addForm {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  background: var(--panel-2);
}
.checkbox {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 6px 0;
  color: var(--text);
}
.checkbox input {
  width: 16px;
  height: 16px;
}
.error {
  color: #c94a4a;
  font-weight: 600;
  margin-top: 6px;
}
.warning {
  color: #c9a94a;
  font-weight: 600;
  margin-top: 6px;
}
.muted {
  color: var(--muted);
}
.compact {
  margin: -2px 0 4px;
  font-size: 12px;
}
button {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--border-2);
  background: var(--accent);
  color: var(--text);
  cursor: pointer;
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
.ghost {
  background: transparent;
}
</style>
