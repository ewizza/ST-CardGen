<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useLocalStorage } from "@vueuse/core";
import ImageSettingsModal from "@/components/modals/ImageSettingsModal.vue";
import FolderPickerModal from "@/components/modals/FolderPickerModal.vue";
import CollapsiblePanel from "@/components/ui/CollapsiblePanel.vue";
import ApiKeySelector from "@/components/ui/ApiKeySelector.vue";
import DebouncedNumberInput from "@/components/ui/DebouncedNumberInput.vue";
import { getLibraryConfig, saveLibraryConfig, type LibraryRepo } from "@/services/library";
import type { FieldDetailProfile, FieldOverrideMode, FieldKey } from "@/services/config";
import { listTextModels, pingTextProvider } from "@/services/text";
import { useConfigStore } from "@/stores/configStore";

type SettingsPanels = {
  text: boolean;
  image: boolean;
  content: boolean;
  fieldDetail: boolean;
  library: boolean;
};

const cfg = useConfigStore();
const libraryPickerOpen = ref(false);
const libraryPickerTarget = ref<{ type: "new" | "existing"; index?: number } | null>(null);
const libraryLoading = ref(false);
const librarySaving = ref(false);
const libraryError = ref<string | null>(null);
const savingContent = ref(false);
const contentError = ref<string | null>(null);
const savingFieldDetail = ref(false);
const fieldDetailError = ref<string | null>(null);
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
  fieldDetail: false,
  library: false,
});

const libraryRepos = ref<LibraryRepo[]>([]);
const libraryActiveRepoId = ref<string>("");
const newRepoName = ref("");
const newRepoKind = ref<"managed" | "folder">("folder");
const newRepoReadOnly = ref(false);
const newRepoDir = ref("");

const pickerInitialPath = computed(() => {
  const target = libraryPickerTarget.value;
  if (!target) return "";
  if (target.type === "new") return newRepoDir.value || "";
  if (typeof target.index === "number") return libraryRepos.value[target.index]?.dir || "";
  return "";
});
function ensureGenerationDefaults() {
  if (!cfg.config) return;
  if (!cfg.config.generation) {
    cfg.config.generation = { contentRating: "nsfw_allowed" };
  }
  if (!cfg.config.generation.fieldDetail) {
    cfg.config.generation.fieldDetail = { profile: "detailed", overrides: {} };
  }
  if (!cfg.config.generation.fieldDetail.overrides) {
    cfg.config.generation.fieldDetail.overrides = {};
  }
}

function ensureFieldDetailDefaults() {
  if (!cfg.config) return;
  ensureGenerationDefaults();
  cfg.config.generation.fieldDetail ??= { profile: "detailed", overrides: {} };
  cfg.config.generation.fieldDetail.overrides ??= {};
}

const contentRating = computed({
  get: () => cfg.config?.generation?.contentRating || "nsfw_allowed",
  set: (value: "sfw" | "nsfw_allowed") => {
    if (cfg.config) {
      ensureGenerationDefaults();
      cfg.config.generation.contentRating = value;
    }
  },
});

const structuredJsonEnabled = computed({
  get: () => cfg.config?.generation?.structuredJson?.enabled ?? true,
  set: (value: boolean) => {
    if (!cfg.config) return;
    if (!cfg.config.generation) {
      cfg.config.generation = {
        contentRating: "nsfw_allowed",
        structuredJson: { enabled: value, temperature: 0.3, top_p: 0.9 },
      };
    } else {
      if (!cfg.config.generation.structuredJson) {
        cfg.config.generation.structuredJson = { enabled: value, temperature: 0.3, top_p: 0.9 };
      }
      cfg.config.generation.structuredJson.enabled = value;
    }
  },
});

const structuredJsonTemp = computed({
  get: () => cfg.config?.generation?.structuredJson?.temperature ?? 0.3,
  set: (value: number) => {
    if (!cfg.config) return;
    if (!cfg.config.generation) {
      cfg.config.generation = {
        contentRating: "nsfw_allowed",
        structuredJson: { enabled: true, temperature: value, top_p: 0.9 },
      };
    } else {
      if (!cfg.config.generation.structuredJson) {
        cfg.config.generation.structuredJson = { enabled: true, temperature: value, top_p: 0.9 };
      }
      cfg.config.generation.structuredJson.temperature = value;
    }
  },
});

const structuredJsonTopP = computed({
  get: () => cfg.config?.generation?.structuredJson?.top_p ?? 0.9,
  set: (value: number) => {
    if (!cfg.config) return;
    if (!cfg.config.generation) {
      cfg.config.generation = {
        contentRating: "nsfw_allowed",
        structuredJson: { enabled: true, temperature: 0.3, top_p: value },
      };
    } else {
      if (!cfg.config.generation.structuredJson) {
        cfg.config.generation.structuredJson = { enabled: true, temperature: 0.3, top_p: 0.9 };
      }
      cfg.config.generation.structuredJson.top_p = value;
    }
  },
});

const fieldDetailProfile = computed({
  get: () => cfg.config?.generation?.fieldDetail?.profile ?? "detailed",
  set: (value: FieldDetailProfile) => {
    if (!cfg.config) return;
    ensureFieldDetailDefaults();
    cfg.config.generation.fieldDetail!.profile = value;
  },
});

const overrideFields: Array<{ key: FieldKey; label: string }> = [
  { key: "description", label: "Description" },
  { key: "personality", label: "Personality" },
  { key: "scenario", label: "Scenario" },
  { key: "first_mes", label: "First Message" },
  { key: "mes_example", label: "Message Examples" },
  { key: "creator_notes", label: "Creator Notes" },
  { key: "tags", label: "Tags" },
];

function getOverride(key: FieldKey): FieldOverrideMode {
  return cfg.config?.generation?.fieldDetail?.overrides?.[key] ?? "inherit";
}

function setOverride(key: FieldKey, value: FieldOverrideMode) {
  if (!cfg.config) return;
  ensureFieldDetailDefaults();
  const overrides = cfg.config.generation.fieldDetail!.overrides!;
  if (value === "inherit") {
    delete (overrides as any)[key];
  } else {
    overrides[key] = value;
  }
}

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
  cfg.config.text.koboldcpp.requestTimeoutMs ??= 10 * 60 * 1000;
  if (!cfg.config.text.koboldcpp.defaultParams) {
    cfg.config.text.koboldcpp.defaultParams = { max_tokens: 896 };
  }
  if (!cfg.config.text.openaiCompat) {
    cfg.config.text.openaiCompat = { baseUrl: "http://127.0.0.1:1234/v1" };
  }
  cfg.config.text.openaiCompat.requestTimeoutMs ??= 10 * 60 * 1000;
  if (!cfg.config.text.openaiCompat.defaultParams) {
    cfg.config.text.openaiCompat.defaultParams = {};
  }
  if (!cfg.config.text.googleGemini) {
    cfg.config.text.googleGemini = {
      openaiBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
      apiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    };
  }
  cfg.config.text.googleGemini.requestTimeoutMs ??= 10 * 60 * 1000;
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

const textMaxTokens = computed<number | undefined>({
  get: () => {
    const params = getActiveDefaultParams(false);
    const v = params?.max_tokens;
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
  },
  set: (v) => {
    const params = getActiveDefaultParams(true);
    if (!params) return;
    params.max_tokens = v;
  },
});

const textRequestTimeoutSec = computed<number>({
  get: () => {
    if (!cfg.config) return 600;
    const p = textProvider.value;
    const ms =
      p === "openai_compat"
        ? cfg.config.text.openaiCompat.requestTimeoutMs
        : p === "google_gemini"
          ? cfg.config.text.googleGemini.requestTimeoutMs
          : cfg.config.text.koboldcpp.requestTimeoutMs;

    const sec = typeof ms === "number" && Number.isFinite(ms) ? Math.round(ms / 1000) : 600;
    return sec;
  },
  set: (sec) => {
    if (!cfg.config) return;
    ensureTextDefaults();
    const clamped = Math.min(3600, Math.max(5, sec || 600));
    const ms = clamped * 1000;

    if (textProvider.value === "openai_compat") cfg.config.text.openaiCompat.requestTimeoutMs = ms;
    else if (textProvider.value === "google_gemini") cfg.config.text.googleGemini.requestTimeoutMs = ms;
    else cfg.config.text.koboldcpp.requestTimeoutMs = ms;
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
      textModel.value = modelOptions.value[0] ?? "";
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

watch(
  () => panels.value.library,
  (open) => {
    if (open) loadLibraryConfig();
  },
  { immediate: true }
);

function makeRepoId(name: string) {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base || `repo-${Date.now()}`;
}

function ensureUniqueRepoId(baseId: string) {
  let candidate = baseId;
  let counter = 2;
  const hasId = (id: string) => libraryRepos.value.some((repo) => repo.id === id);
  while (hasId(candidate)) {
    candidate = `${baseId}-${counter}`;
    counter += 1;
  }
  return candidate;
}

async function loadLibraryConfig() {
  if (libraryLoading.value) return;
  libraryLoading.value = true;
  libraryError.value = null;
  try {
    const res = await getLibraryConfig();
    if (!res.ok) {
      libraryError.value = res.error ?? "Failed to load library config.";
      return;
    }
    libraryRepos.value = res.repositories ?? [];
    const fallbackId = res.activeRepoId || res.repositories?.[0]?.id || "";
    const hasActive = res.repositories?.some((repo) => repo.id === res.activeRepoId);
    libraryActiveRepoId.value = hasActive ? res.activeRepoId : fallbackId;
  } catch (e: any) {
    libraryError.value = String(e?.message ?? e);
  } finally {
    libraryLoading.value = false;
  }
}

function openRepoPicker(index: number) {
  libraryPickerTarget.value = { type: "existing", index };
  libraryPickerOpen.value = true;
}

function openNewRepoPicker() {
  libraryPickerTarget.value = { type: "new" };
  libraryPickerOpen.value = true;
}

function onPickRepoDir(dir: string) {
  libraryError.value = null;
  const target = libraryPickerTarget.value;
  if (!target) return;
  if (target.type === "new") {
    newRepoDir.value = dir;
  } else if (typeof target.index === "number") {
    const repo = libraryRepos.value[target.index];
    if (repo) repo.dir = dir;
  }
}

function addRepository() {
  libraryError.value = null;
  if (!newRepoName.value.trim()) {
    libraryError.value = "Repository name is required.";
    return;
  }
  if (!newRepoDir.value.trim()) {
    libraryError.value = "Repository folder is required.";
    return;
  }
  const baseId = makeRepoId(newRepoName.value);
  const id = ensureUniqueRepoId(baseId);
  libraryRepos.value.push({
    id,
    name: newRepoName.value.trim(),
    dir: newRepoDir.value.trim(),
    kind: newRepoKind.value,
    readOnly: newRepoReadOnly.value,
  });
  newRepoName.value = "";
  newRepoDir.value = "";
  newRepoKind.value = "folder";
  newRepoReadOnly.value = false;
  if (!libraryActiveRepoId.value) libraryActiveRepoId.value = id;
}

function removeRepository(id: string) {
  if (id === "cardgen") {
    libraryError.value = "CardGen repository cannot be removed.";
    return;
  }
  libraryRepos.value = libraryRepos.value.filter((repo) => repo.id !== id);
  if (libraryActiveRepoId.value === id) {
    libraryActiveRepoId.value = libraryRepos.value[0]?.id || "";
  }
}

async function onSaveLibrarySettings() {
  libraryError.value = null;
  librarySaving.value = true;
  try {
    const res = await saveLibraryConfig({
      activeRepoId: libraryActiveRepoId.value,
      repositories: libraryRepos.value,
    });
    if (!res.ok) {
      libraryError.value = res.error ?? "Failed to save library settings.";
      return;
    }
    if (cfg.config) {
      cfg.config.library.dir = res.dir;
      cfg.config.library.activeRepoId = res.activeRepoId;
      cfg.config.library.repositories = res.repositories ?? [];
    }
  } catch (e: any) {
    libraryError.value = String(e?.message ?? e);
  } finally {
    librarySaving.value = false;
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

async function onSaveFieldDetail() {
  fieldDetailError.value = null;
  savingFieldDetail.value = true;
  try {
    ensureGenerationDefaults();
    await cfg.save();
  } catch (e: any) {
    fieldDetailError.value = String(e?.message ?? e);
  } finally {
    savingFieldDetail.value = false;
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
          <DebouncedNumberInput
            v-model="textMaxTokens"
            :min="128"
            :max="8196"
            :debounce-ms="250"
            :allow-empty="true"
            placeholder="(unset)"
          />
        </label>

        <label class="field">
          <span>Request timeout (seconds)</span>
          <DebouncedNumberInput
            v-model="textRequestTimeoutSec"
            :min="5"
            :max="3600"
            :debounce-ms="250"
            :allow-empty="false"
            placeholder="600"
          />
          <small class="muted">Applies to the selected provider</small>
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
        <hr class="sep" />
        <label class="field">
          <span>Structured JSON mode</span>
          <div class="row">
            <input type="checkbox" v-model="structuredJsonEnabled" />
            <span class="muted">Improves JSON reliability for local models by using low temperature / top_p on structured endpoints.</span>
          </div>
        </label>
        <div v-if="structuredJsonEnabled" class="grid">
          <label class="field">
            <span>Structured temperature</span>
            <input type="number" min="0" max="2" step="0.05" v-model.number="structuredJsonTemp" />
          </label>
          <label class="field">
            <span>Structured top_p</span>
            <input type="number" min="0" max="1" step="0.05" v-model.number="structuredJsonTopP" />
          </label>
        </div>
        <div class="row">
          <button @click="onSaveContentRating" :disabled="savingContent">
            {{ savingContent ? "Saving..." : "Save" }}
          </button>
          <span class="muted">Affects image prompt generation</span>
        </div>
        <p v-if="contentError" class="error">{{ contentError }}</p>
      </CollapsiblePanel>

      <CollapsiblePanel v-model="panels.fieldDetail" title="Character Field Detail">
        <label class="field">
          <span>Preset</span>
          <select v-model="fieldDetailProfile">
            <option value="short">Short</option>
            <option value="detailed">Detailed</option>
            <option value="verbose">Verbose</option>
          </select>
        </label>

        <details class="details">
          <summary>Per-field overrides</summary>
          <div class="override-grid">
            <label v-for="field in overrideFields" :key="field.key" class="field">
              <span>{{ field.label }}</span>
              <select
                :value="getOverride(field.key)"
                @change="setOverride(field.key, ($event.target as HTMLSelectElement).value as FieldOverrideMode)"
              >
                <option value="inherit">Inherit</option>
                <option value="short">Short</option>
                <option value="detailed">Detailed</option>
                <option value="verbose">Verbose</option>
              </select>
            </label>
          </div>
        </details>

        <div class="row">
          <button @click="onSaveFieldDetail" :disabled="savingFieldDetail">
            {{ savingFieldDetail ? "Saving..." : "Save Field Detail" }}
          </button>
        </div>
        <p v-if="fieldDetailError" class="error">{{ fieldDetailError }}</p>
      </CollapsiblePanel>

      <CollapsiblePanel v-model="panels.library" title="Library">
        <div class="row">
          <label class="field grow">
            <span>Active repository</span>
            <select v-model="libraryActiveRepoId">
              <option v-for="repo in libraryRepos" :key="repo.id" :value="repo.id">
                {{ repo.name }}
              </option>
            </select>
          </label>
          <button @click="onSaveLibrarySettings" :disabled="librarySaving">
            {{ librarySaving ? "Saving..." : "Save Library Settings" }}
          </button>
        </div>

        <p v-if="libraryLoading" class="muted">Loading repositories...</p>

        <div class="repo-list">
          <div v-for="(repo, index) in libraryRepos" :key="repo.id" class="repo-card">
            <div class="row">
              <label class="field grow">
                <span>Name</span>
                <input v-model="repo.name" type="text" />
              </label>
              <label class="field">
                <span>Kind</span>
                <select v-model="repo.kind">
                  <option value="managed">Managed</option>
                  <option value="folder">Folder</option>
                </select>
              </label>
              <label class="field">
                <span>Read-only</span>
                <input type="checkbox" v-model="repo.readOnly" />
              </label>
            </div>
            <div class="row">
              <label class="field grow">
                <span>Path</span>
                <input class="path" type="text" v-model="repo.dir" readonly />
              </label>
              <button class="ghost" @click="openRepoPicker(index)">Choose...</button>
              <button class="ghost" @click="removeRepository(repo.id)" :disabled="repo.id === 'cardgen'">Remove</button>
            </div>
            <p class="muted">Id: {{ repo.id }}</p>
          </div>
        </div>

        <div class="repo-card repo-add">
          <h3>Add repository</h3>
          <div class="row">
            <label class="field grow">
              <span>Name</span>
              <input v-model="newRepoName" type="text" placeholder="SillyTavern" />
            </label>
            <label class="field">
              <span>Kind</span>
              <select v-model="newRepoKind">
                <option value="managed">Managed</option>
                <option value="folder">Folder</option>
              </select>
            </label>
            <label class="field">
              <span>Read-only</span>
              <input type="checkbox" v-model="newRepoReadOnly" />
            </label>
          </div>
          <div class="row">
            <label class="field grow">
              <span>Path</span>
              <input class="path" type="text" v-model="newRepoDir" readonly />
            </label>
            <button class="ghost" @click="openNewRepoPicker">Choose...</button>
            <button @click="addRepository">Add</button>
          </div>
        </div>

        <p v-if="libraryError" class="error">{{ libraryError }}</p>
      </CollapsiblePanel>
    </div>
    <FolderPickerModal
      v-model="libraryPickerOpen"
      :initial-path="pickerInitialPath"
      @select="onPickRepoDir"
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
.sep {
  border: 0;
  border-top: 1px solid var(--border);
  margin: 12px 0;
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
.repo-list {
  display: grid;
  gap: 12px;
  margin-top: 10px;
}
.repo-card {
  border: 1px solid var(--border-2);
  border-radius: 12px;
  padding: 12px;
  display: grid;
  gap: 10px;
  background: var(--panel-2);
}
.repo-add h3 {
  margin: 0;
  font-size: 14px;
}
.override-grid {
  display: grid;
  gap: 10px;
  margin-top: 10px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
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
.grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
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
