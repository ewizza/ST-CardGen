<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useLocalStorage } from "@vueuse/core";
import ImageSettingsModal from "@/components/modals/ImageSettingsModal.vue";
import FolderPickerModal from "@/components/modals/FolderPickerModal.vue";
import CollapsiblePanel from "@/components/ui/CollapsiblePanel.vue";
import ApiKeySelector from "@/components/ui/ApiKeySelector.vue";
import { setLibraryConfig } from "@/services/library";
import { listTextModels, pingTextProvider } from "@/services/text";
import { useConfigStore } from "@/stores/configStore";

type SettingsPanels = {
  text: boolean;
  image: boolean;
  content: boolean;
  library: boolean;
};

const cfg = useConfigStore();
const pickerOpen = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const savingContent = ref(false);
const contentError = ref<string | null>(null);
const savingText = ref(false);
const textError = ref<string | null>(null);
const modelsLoading = ref(false);
const modelsError = ref<string | null>(null);
const modelOptions = ref<string[]>([]);
const pingStatus = ref<"ok" | "fail" | null>(null);
const pingError = ref<string | null>(null);
const panels = useLocalStorage<SettingsPanels>("ccg_settings_panels_v1", {
  text: true,
  image: true,
  content: false,
  library: false,
});

const libraryDir = computed(() => cfg.config?.library?.dir || "");
const contentRating = computed({
  get: () => cfg.config?.generation?.contentRating || "nsfw_allowed",
  set: (value: "sfw" | "nsfw_allowed") => {
    if (cfg.config) {
      if (!cfg.config.generation) cfg.config.generation = { contentRating: value };
      else cfg.config.generation.contentRating = value;
    }
  },
});

const textProvider = computed({
  get: () => cfg.config?.text?.provider || "koboldcpp",
  set: (value: "koboldcpp" | "openai_compat" | "google_gemini") => {
    if (!cfg.config) return;
    cfg.config.text.provider = value;
  },
});

const textBaseUrl = computed({
  get: () => {
    if (!cfg.config) return "";
    if (textProvider.value === "openai_compat") return cfg.config.text.openaiCompat.baseUrl;
    if (textProvider.value === "google_gemini") return cfg.config.text.googleGemini.openaiBaseUrl;
    return cfg.config.text.koboldcpp.baseUrl;
  },
  set: (value) => {
    if (!cfg.config) return;
    if (textProvider.value === "openai_compat") cfg.config.text.openaiCompat.baseUrl = value;
    else if (textProvider.value === "google_gemini") cfg.config.text.googleGemini.openaiBaseUrl = value;
    else cfg.config.text.koboldcpp.baseUrl = value;
  },
});

const textModel = computed({
  get: () => {
    if (!cfg.config) return "";
    if (textProvider.value === "openai_compat") return (cfg.config.text.openaiCompat.model ?? "");
    if (textProvider.value === "google_gemini") return (cfg.config.text.googleGemini.model ?? "");
    return (cfg.config.text.koboldcpp.model ?? "");
  },
  set: (value) => {
    if (!cfg.config) return;
    if (textProvider.value === "openai_compat") cfg.config.text.openaiCompat.model = value || undefined;
    else if (textProvider.value === "google_gemini") cfg.config.text.googleGemini.model = value || undefined;
    else cfg.config.text.koboldcpp.model = value || undefined;
  },
});

const apiKeyRef = computed({
  get: () => cfg.config?.text.openaiCompat.apiKeyRef ?? "",
  set: (value: string) => {
    if (!cfg.config) return;
    cfg.config.text.openaiCompat.apiKeyRef = value || undefined;
  },
});

const geminiKeyRef = computed({
  get: () => cfg.config?.text.googleGemini.apiKeyRef ?? "",
  set: (value: string) => {
    if (!cfg.config) return;
    cfg.config.text.googleGemini.apiKeyRef = value || undefined;
  },
});

const activeKeyRef = computed(() => {
  if (textProvider.value === "openai_compat") return apiKeyRef.value;
  if (textProvider.value === "google_gemini") return geminiKeyRef.value;
  return "";
});

const geminiApiBaseUrl = computed({
  get: () => cfg.config?.text.googleGemini.apiBaseUrl ?? "",
  set: (value: string) => {
    if (!cfg.config) return;
    cfg.config.text.googleGemini.apiBaseUrl = value || "https://generativelanguage.googleapis.com/v1beta";
  },
});

function ensureTextDefaults() {
  if (!cfg.config) return;
  if (!cfg.config.text.koboldcpp) {
    cfg.config.text.koboldcpp = { baseUrl: "http://127.0.0.1:5001" };
  }
  if (!cfg.config.text.koboldcpp.defaultParams) {
    cfg.config.text.koboldcpp.defaultParams = { max_tokens: 896 };
  }
  if (!cfg.config.text.openaiCompat) {
    cfg.config.text.openaiCompat = { baseUrl: "http://127.0.0.1:1234/v1" };
  }
  if (!cfg.config.text.openaiCompat.defaultParams) {
    cfg.config.text.openaiCompat.defaultParams = {};
  }
  if (!cfg.config.text.googleGemini) {
    cfg.config.text.googleGemini = {
      openaiBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
      apiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    };
  }
  if (!cfg.config.text.googleGemini.defaultParams) {
    cfg.config.text.googleGemini.defaultParams = {};
  }
}

function getActiveDefaultParams(ensure: boolean) {
  if (!cfg.config) return null;
  if (textProvider.value === "openai_compat") {
    if (ensure) cfg.config.text.openaiCompat.defaultParams ??= {};
    return cfg.config.text.openaiCompat.defaultParams ?? null;
  }
  if (textProvider.value === "google_gemini") {
    if (ensure) cfg.config.text.googleGemini.defaultParams ??= {};
    return cfg.config.text.googleGemini.defaultParams ?? null;
  }
  if (ensure) cfg.config.text.koboldcpp.defaultParams ??= {};
  return cfg.config.text.koboldcpp.defaultParams ?? null;
}

const textMaxTokensInput = computed({
  get: () => {
    const params = getActiveDefaultParams(false);
    if (!params) return "";
    const value = params.max_tokens;
    return typeof value === "number" ? String(value) : "";
  },
  set: (value: string) => {
    const params = getActiveDefaultParams(true);
    if (!params) return;
    const raw = String(value ?? "").trim();
    if (!raw) {
      params.max_tokens = undefined;
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      params.max_tokens = undefined;
      return;
    }
    const clamped = Math.min(8196, Math.max(128, parsed));
    params.max_tokens = clamped;
  },
});

async function refreshTextModels() {
  modelsError.value = null;
  modelsLoading.value = true;
  try {
    const res = await listTextModels();
    if (!res.ok) throw new Error(res.error || "Failed to load models");
    modelOptions.value = res.models ?? [];
    if (!textModel.value && modelOptions.value.length) {
      textModel.value = modelOptions.value[0];
    }
  } catch (e: any) {
    modelsError.value = String(e?.message ?? e);
    modelOptions.value = [];
  } finally {
    modelsLoading.value = false;
  }
}

async function pingText() {
  pingError.value = null;
  pingStatus.value = null;
  try {
    const res = await pingTextProvider();
    if (!res.ok) throw new Error(res.error || "Connection failed");
    pingStatus.value = "ok";
  } catch (e: any) {
    pingStatus.value = "fail";
    pingError.value = String(e?.message ?? e);
  }
}

async function onSaveTextSettings() {
  textError.value = null;
  savingText.value = true;
  try {
    await cfg.save();
  } catch (e: any) {
    textError.value = String(e?.message ?? e);
  } finally {
    savingText.value = false;
  }
}

let apiKeyRefReady = false;
watch(
  () => activeKeyRef.value,
  async (value, oldValue) => {
    if (!cfg.config) return;
    if (!apiKeyRefReady) {
      apiKeyRefReady = true;
      return;
    }
    if (value === oldValue) return;
    await cfg.save();
  }
);

watch(
  () => textProvider.value,
  async () => {
    ensureTextDefaults();
    await cfg.save();
    await pingText();
    await refreshTextModels();
  },
  { immediate: true }
);

async function onSelectDir(dir: string) {
  error.value = null;
  saving.value = true;
  try {
    const res = await setLibraryConfig(dir);
    if (!res.ok) {
      error.value = res.error ?? "Failed to save library folder.";
      return;
    }
    if (cfg.config) cfg.config.library.dir = res.dir;
  } catch (e: any) {
    error.value = String(e?.message ?? e);
  } finally {
    saving.value = false;
  }
}

async function onSaveContentRating() {
  contentError.value = null;
  savingContent.value = true;
  try {
    await cfg.save();
  } catch (e: any) {
    contentError.value = String(e?.message ?? e);
  } finally {
    savingContent.value = false;
  }
}
</script>

<template>
  <section class="page">
    <div data-page-top tabindex="-1" style="outline:none;"></div>
    <h1 class="title">Settings</h1>
    <div class="panels">
      <CollapsiblePanel v-model="panels.text" title="Text Completion">
        <label class="field">
          <span>Provider</span>
          <select v-model="textProvider">
            <option value="koboldcpp">KoboldCPP</option>
            <option value="openai_compat">OpenAI Compatible</option>
            <option value="google_gemini">Google Gemini</option>
          </select>
        </label>

        <label class="field">
          <span>Base URL</span>
          <input v-model="textBaseUrl" placeholder="http://localhost:1234/v1" />
        </label>

        <div v-if="textProvider === 'openai_compat'" class="api-key">
          <div class="api-key-title">API Key</div>
          <ApiKeySelector v-model="apiKeyRef" provider="openai_compat" />
        </div>
        <div v-else-if="textProvider === 'google_gemini'" class="api-key">
          <div class="api-key-title">API Key</div>
          <ApiKeySelector v-model="geminiKeyRef" provider="google_gemini" />
        </div>

        <details v-if="textProvider === 'google_gemini'" class="details">
          <summary>Advanced</summary>
          <label class="field">
            <span>API Base URL</span>
            <input v-model="geminiApiBaseUrl" placeholder="https://generativelanguage.googleapis.com/v1beta" />
          </label>
        </details>

        <div class="row">
          <label class="field grow">
            <span>Model</span>
            <select v-model="textModel">
              <option value="">(auto)</option>
              <option v-for="m in modelOptions" :key="m" :value="m">{{ m }}</option>
            </select>
          </label>
          <button class="ghost" @click="refreshTextModels" :disabled="modelsLoading">
            {{ modelsLoading ? "Loading..." : "Refresh models" }}
          </button>
        </div>

        <label class="field">
          <span>Max Tokens</span>
          <input
            v-model="textMaxTokensInput"
            type="number"
            min="128"
            max="8196"
            step="1"
            placeholder="(unset)"
          />
        </label>

        <div class="row">
          <button @click="pingText">Ping</button>
          <span v-if="pingStatus === 'ok'" class="muted">Connected</span>
          <span v-else-if="pingStatus === 'fail'" class="error">{{ pingError || "Connection failed" }}</span>
        </div>

        <div class="row">
          <button @click="onSaveTextSettings" :disabled="savingText">
            {{ savingText ? "Saving..." : "Save Text Settings" }}
          </button>
        </div>
        <p v-if="modelsError" class="error">{{ modelsError }}</p>
        <p v-if="textError" class="error">{{ textError }}</p>
      </CollapsiblePanel>

      <CollapsiblePanel v-model="panels.image" title="Image Settings">
        <ImageSettingsModal />
      </CollapsiblePanel>

      <CollapsiblePanel v-model="panels.content" title="Content Rating">
        <label class="field">
          <span>LLM content rating</span>
          <select v-model="contentRating">
            <option value="nsfw_allowed">NSFW allowed</option>
            <option value="sfw">SFW only</option>
          </select>
        </label>
        <div class="row">
          <button @click="onSaveContentRating" :disabled="savingContent">
            {{ savingContent ? "Saving..." : "Save" }}
          </button>
          <span class="muted">Affects image prompt generation</span>
        </div>
        <p v-if="contentError" class="error">{{ contentError }}</p>
      </CollapsiblePanel>

      <CollapsiblePanel v-model="panels.library" title="Library">
        <div class="library-row">
          <input class="path" type="text" :value="libraryDir" readonly />
          <button class="ghost" @click="pickerOpen = true" :disabled="saving">
            {{ saving ? "Saving..." : "Choose..." }}
          </button>
        </div>
        <p v-if="error" class="error">{{ error }}</p>
      </CollapsiblePanel>
    </div>
    <FolderPickerModal
      v-model="pickerOpen"
      :initial-path="libraryDir"
      @select="onSelectDir"
    />
  </section>
</template>

<style scoped>
.page {
  max-width: 900px;
}
.title {
  margin: 0 0 16px;
  font-size: 24px;
}
.panels {
  display: grid;
  gap: 16px;
}
.api-key {
  margin-top: 8px;
  display: grid;
  gap: 8px;
}
.api-key-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.library-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: center;
}
.path {
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--border-2);
  background: var(--panel-3);
  color: var(--text);
}
.ghost {
  background: transparent;
}
.error {
  color: #c94a4a;
  font-weight: 600;
  margin-top: 10px;
}
.row {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 10px;
  flex-wrap: wrap;
}
.grow {
  flex: 1;
}
.field {
  display: grid;
  gap: 6px;
  margin: 10px 0;
}
.field select {
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--border-2);
  background: var(--panel-3);
  color: var(--text);
}
.muted {
  color: var(--muted);
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
</style>
