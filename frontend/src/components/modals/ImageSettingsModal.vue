<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { comfyModels, comfyLoras } from "@/services/comfyui";
import { connectImageProvider, listComfyWorkflows } from "@/services/image";
import { useConfigStore } from "@/stores/configStore";
import ApiKeySelector from "@/components/ui/ApiKeySelector.vue";

const cfg = useConfigStore();

const image = computed(() => cfg.config?.image);
const isComfy = computed(() => image.value?.provider === "comfyui");
const isStability = computed(() => image.value?.provider === "stability");
const isHuggingFace = computed(() => image.value?.provider === "huggingface");
const isGoogle = computed(() => image.value?.provider === "google");
const providerInfo = computed(() => cfg.config?.image.providerInfo?.[cfg.config?.image.provider]);
const workflows = ref<Array<{ name: string; title: string; hasLora: boolean }>>([]);
const selectedWorkflow = computed(() =>
  workflows.value.find((w) => w.name === cfg.config?.image.comfyui.workflow)
);
const hasLora = computed(() => Boolean(selectedWorkflow.value?.hasLora));

const baseUrl = computed({
  get: () => {
    if (!cfg.config) return "";
    if (cfg.config.image.provider === "stability") {
      ensureStabilitySettings();
      return cfg.config.image.stability?.baseUrl
        || cfg.config.image.baseUrls?.stability
        || "https://api.stability.ai";
    }
    if (cfg.config.image.provider === "google") {
      ensureGoogleSettings();
      return cfg.config.image.google?.baseUrl
        || cfg.config.image.baseUrls?.google
        || "https://generativelanguage.googleapis.com";
    }
    ensureBaseUrls();
    return cfg.config.image.baseUrls[cfg.config.image.provider];
  },
  set: (value) => {
    if (!cfg.config) return;
    if (cfg.config.image.provider === "stability") {
      ensureStabilitySettings();
      cfg.config.image.stability!.baseUrl = value;
      ensureBaseUrls();
      cfg.config.image.baseUrls.stability = value;
      return;
    }
    if (cfg.config.image.provider === "google") {
      ensureGoogleSettings();
      cfg.config.image.google!.baseUrl = value;
      ensureBaseUrls();
      cfg.config.image.baseUrls.google = value;
      return;
    }
    ensureBaseUrls();
    cfg.config.image.baseUrls[cfg.config.image.provider] = value;
  },
});

const loadingLists = ref(false);
const modelOptions = ref<string[]>([]);
const loraOptions = ref<string[]>([]);
const listError = ref<string | null>(null);
const samplerOptions = ref<string[]>([]);
const schedulerOptions = ref<string[]>([]);
const loadingSS = ref(false);
const ssError = ref<string | null>(null);
const ssWarning = ref<string | null>(null);
const workflowError = ref<string | null>(null);

function ensureImageDefaults() {
  if (!cfg.config) return;
  cfg.config.image ??= {} as any;

  cfg.config.image.comfyui ??= {} as any;
  cfg.config.image.stability ??= {} as any;
  cfg.config.image.huggingface ??= {} as any;
  cfg.config.image.google ??= {} as any;

  cfg.config.image.google!.imagen ??= {} as any;
  cfg.config.image.google!.nano ??= {} as any;
}

async function save() {
  await cfg.save();
}

async function loadComfyLists() {
  if (!cfg.config) return; // safety
  listError.value = null;
  loadingLists.value = true;

  try {
    const [m, l] = await Promise.all([comfyModels(), comfyLoras()]);
    modelOptions.value = m.models ?? [];
    loraOptions.value = l.loras ?? [];
  } catch (e: any) {
    listError.value = String(e?.message ?? e);
  } finally {
    loadingLists.value = false;
  }
}

async function loadWorkflows() {
  if (!cfg.config) return;
  workflowError.value = null;
  try {
    const res = await listComfyWorkflows();
    if (!res.ok) throw new Error(res.error || "Failed to load workflows");
    workflows.value = res.workflows ?? [];
    if (!cfg.config.image.comfyui.workflow) {
      ensureImageDefaults();
      const first = workflows.value?.[0];
      if (first?.name) {
        cfg.config.image.comfyui!.workflow = first.name;
      }
    }
  } catch (e: any) {
    workflowError.value = String(e?.message ?? e);
    workflows.value = [];
  }
}

function ensureBaseUrls() {
  if (!cfg.config) return;
  const current = cfg.config.image.baseUrls ?? {
    sdapi: "http://127.0.0.1:7860",
    comfyui: "http://127.0.0.1:8188",
    koboldcpp: "http://127.0.0.1:5001",
    stability: "https://api.stability.ai",
    huggingface: "https://router.huggingface.co",
    google: "https://generativelanguage.googleapis.com",
  };
  cfg.config.image.baseUrls = {
    sdapi: current.sdapi || "http://127.0.0.1:7860",
    comfyui: current.comfyui || "http://127.0.0.1:8188",
    koboldcpp: current.koboldcpp || "http://127.0.0.1:5001",
    stability: current.stability || "https://api.stability.ai",
    huggingface: current.huggingface || "https://router.huggingface.co",
    google: current.google || "https://generativelanguage.googleapis.com",
  };
}

function ensureStabilitySettings() {
  if (!cfg.config) return;
  ensureImageDefaults();
  const fallbackBaseUrl = cfg.config.image.baseUrls?.stability || "https://api.stability.ai";
  cfg.config.image.stability = cfg.config.image.stability ?? {
    baseUrl: fallbackBaseUrl,
    apiKeyRef: undefined,
    aspectRatio: "1:1",
    outputFormat: "png",
  };
}

const stabilityKeyRef = computed({
  get: () => cfg.config?.image.stability?.apiKeyRef ?? null,
  set: (value: string | null) => {
    if (!cfg.config) return;
    ensureImageDefaults();
    ensureStabilitySettings();
    cfg.config.image.stability!.apiKeyRef = value || undefined;
  },
});

function ensureHuggingFaceSettings() {
  if (!cfg.config) return;
  ensureImageDefaults();
  cfg.config.image.huggingface = cfg.config.image.huggingface ?? {
    apiKeyRef: undefined,
    model: "black-forest-labs/FLUX.1-schnell",
    provider: "hf-inference",
  };
}

function ensureGoogleSettings() {
  if (!cfg.config) return;
  ensureImageDefaults();
  cfg.config.image.google = cfg.config.image.google ?? {
    baseUrl: cfg.config.image.baseUrls?.google || "https://generativelanguage.googleapis.com",
    apiKeyRef: undefined,
    mode: "imagen",
    imagen: {
      model: "imagen-4.0-generate-001",
      numberOfImages: 1,
      imageSize: "1K",
      aspectRatio: "1:1",
      personGeneration: "allow_adult",
    },
    nano: {
      model: "gemini-2.5-flash-image",
      aspectRatio: "1:1",
      imageSize: undefined,
    },
  };
}

const huggingfaceKeyRef = computed({
  get: () => cfg.config?.image.huggingface?.apiKeyRef ?? null,
  set: (value: string | null) => {
    if (!cfg.config) return;
    ensureImageDefaults();
    ensureHuggingFaceSettings();
    cfg.config.image.huggingface!.apiKeyRef = value || undefined;
  },
});

const googleKeyRef = computed({
  get: () => cfg.config?.image.google?.apiKeyRef ?? null,
  set: (value: string | null) => {
    if (!cfg.config) return;
    ensureImageDefaults();
    ensureGoogleSettings();
    cfg.config.image.google!.apiKeyRef = value || undefined;
  },
});

async function connectProvider(provider: "comfyui" | "sdapi" | "koboldcpp" | "stability" | "huggingface" | "google") {
  if (!cfg.config) return;
  ssError.value = null;
  ssWarning.value = null;
  loadingSS.value = true;
  try {
    const res = await connectImageProvider(provider);
    const checkedAt = res.checkedAt || new Date().toISOString();
    const info = {
      ok: Boolean(res.ok),
      checkedAt,
      baseUrl: res.baseUrl,
      details: res.details,
      samplers: res.samplers ?? [],
      schedulers: res.schedulers ?? [],
      warning: res.warning,
      error: res.error,
    };
    cfg.config.image.providerInfo = cfg.config.image.providerInfo ?? {};
    cfg.config.image.providerInfo[provider] = info;
    samplerOptions.value = info.samplers ?? [];
    schedulerOptions.value = info.schedulers ?? [];
    ssWarning.value = info.warning ?? null;
    if (!res.ok) ssError.value = res.error || "Failed to connect";
    if (provider === "comfyui" && res.details?.workflows) {
      workflows.value = res.details.workflows;
      if (!cfg.config.image.comfyui.workflow) {
        ensureImageDefaults();
        const first = workflows.value?.[0];
        if (first?.name) {
          cfg.config.image.comfyui!.workflow = first.name;
        }
      }
    }
    await cfg.save();
  } catch (e: any) {
    const checkedAt = new Date().toISOString();
    const errorText = String(e?.message ?? e);
    cfg.config.image.providerInfo = cfg.config.image.providerInfo ?? {};
    cfg.config.image.providerInfo[provider] = {
      ok: false,
      checkedAt,
      baseUrl: baseUrl.value,
      samplers: [],
      schedulers: [],
      error: errorText,
    };
    await cfg.save();
    ssError.value = errorText;
    samplerOptions.value = [];
    schedulerOptions.value = [];
  } finally {
    loadingSS.value = false;
  }
}

watch(
  () => cfg.config?.image.provider,
  async (provider) => {
    if (!provider || !cfg.config) return;
    samplerOptions.value = [];
    schedulerOptions.value = [];
    ensureBaseUrls();
    if (provider === "stability") {
      ensureStabilitySettings();
      return;
    }
    if (provider === "huggingface") {
      ensureHuggingFaceSettings();
    }
    if (provider === "google") {
      ensureGoogleSettings();
    }
    const cached = cfg.config.image.providerInfo?.[provider];
    if (cached) {
      samplerOptions.value = cached.samplers ?? [];
      schedulerOptions.value = cached.schedulers ?? [];
      ssWarning.value = cached.warning ?? null;
      ssError.value = cached.ok ? null : cached.error ?? null;
    }
    if (provider === "comfyui") {
      await loadWorkflows();
    }
    await connectProvider(provider);
  },
  { immediate: true }
);

watch(
  () => cfg.config?.image.comfyui.workflow,
  async (workflow) => {
    if (!workflow || !cfg.config) return;
    if (cfg.config.image.provider !== "comfyui") return;
    await loadComfyLists();
    if (!hasLora.value) loraOptions.value = [];
  }
);

onMounted(() => {
  ensureImageDefaults();
});
</script>

<template>
  <div v-if="!cfg.config" class="card">
    Loading config…
  </div>

  <div v-else class="card">
    <h2>Image Settings</h2>

    <label class="field">
      <span>Provider</span>
      <select v-model="cfg.config.image.provider">
        <option value="">-none-</option>
        <option value="comfyui">ComfyUI</option>
        <option value="sdapi">SDAPI (A1111 / SD WebUI)</option>
        <option value="koboldcpp">KoboldCPP</option>
        <option value="stability">Stability</option>
        <option value="huggingface">Hugging Face</option>
        <option value="google">Google (Imagen / Nano Banana)</option>
      </select>
    </label>

    <label class="field">
      <span>Base URL</span>
      <input v-model="baseUrl" placeholder="http://127.0.0.1:8188" />
    </label>
    <div class="row">
      <button class="ghost" @click="connectProvider(cfg.config.image.provider)" :disabled="loadingSS">
        {{ loadingSS ? "Checking..." : "Ping provider" }}
      </button>
      <span class="muted">Checks connectivity + updates status.</span>
    </div>

    <div v-if="providerInfo" class="row">
      <span :class="providerInfo.ok ? 'muted' : 'bad'">
        {{ providerInfo.ok ? "Connected" : "Connection failed" }}
      </span>
      <span class="muted">Last checked: {{ providerInfo.checkedAt }}</span>
      <span v-if="providerInfo.error" class="bad">{{ providerInfo.error }}</span>
      <details v-if="providerInfo.details && providerInfo.error" class="details">
        <summary>Details</summary>
        <pre class="pre">{{ JSON.stringify(providerInfo.details, null, 2) }}</pre>
      </details>
      <span v-else class="muted">
        samplers: {{ providerInfo.samplers?.length ?? 0 }},
        schedulers: {{ providerInfo.schedulers?.length ?? 0 }}
      </span>
    </div>

    <div v-if="isHuggingFace && cfg.config?.image?.huggingface" class="card2 providerBlock">
      <h3>Hugging Face</h3>

      <ApiKeySelector
        v-model="huggingfaceKeyRef"
        provider="huggingface"
        label="API key"
        :showTest="false"
      />

      <label class="field">
        <span>Model ID</span>
        <input v-model="cfg.config.image.huggingface.model" placeholder="black-forest-labs/FLUX.1-schnell" />
        <small class="muted">Model is a Hugging Face repo ID.</small>
      </label>

      <label class="field">
        <span>Provider routing</span>
        <select v-model="cfg.config.image.huggingface.provider">
          <option value="hf-inference">hf-inference</option>
          <option value="auto">auto</option>
        </select>
        <small class="muted">Choose routing: hf-inference (default) or auto.</small>
      </label>
    </div>

    <div v-if="isGoogle && cfg.config?.image?.google" class="card2 providerBlock">
      <h3>Google</h3>

      <ApiKeySelector
        v-model="googleKeyRef"
        provider="google"
        label="API key"
        :showTest="false"
      />

      <label class="field">
        <span>Mode</span>
        <select v-model="cfg.config.image.google.mode">
          <option value="imagen">Imagen</option>
          <option value="nano">Nano Banana</option>
        </select>
      </label>

      <div v-if="cfg.config.image.google.mode === 'imagen'" class="grid">
        <label class="field">
          <span>Model</span>
          <input v-model="cfg.config.image.google.imagen.model" placeholder="imagen-4.0-generate-001" />
        </label>

        <label class="field">
          <span>Number of images</span>
          <select v-model.number="cfg.config.image.google.imagen.numberOfImages">
            <option :value="1">1</option>
            <option :value="2">2</option>
            <option :value="3">3</option>
            <option :value="4">4</option>
          </select>
        </label>

        <label class="field">
          <span>Image size</span>
          <select v-model="cfg.config.image.google.imagen.imageSize">
            <option value="1K">1K</option>
            <option value="2K">2K</option>
          </select>
        </label>

        <label class="field">
          <span>Aspect ratio</span>
          <select v-model="cfg.config.image.google.imagen.aspectRatio">
            <option value="1:1">1:1</option>
            <option value="3:4">3:4</option>
            <option value="4:3">4:3</option>
            <option value="9:16">9:16</option>
            <option value="16:9">16:9</option>
          </select>
        </label>

        <label class="field">
          <span>Person generation</span>
          <select v-model="cfg.config.image.google.imagen.personGeneration">
            <option value="dont_allow">dont_allow</option>
            <option value="allow_adult">allow_adult</option>
            <option value="allow_all">allow_all</option>
          </select>
        </label>
      </div>

      <div v-else class="grid">
        <label class="field">
          <span>Nano model</span>
          <select v-model="cfg.config.image.google.nano.model">
            <option value="gemini-2.5-flash-image">gemini-2.5-flash-image</option>
            <option value="gemini-3-pro-image-preview">gemini-3-pro-image-preview</option>
          </select>
        </label>

        <label class="field">
          <span>Aspect ratio</span>
          <select v-model="cfg.config.image.google.nano.aspectRatio">
            <option value="1:1">1:1</option>
            <option value="2:3">2:3</option>
            <option value="3:2">3:2</option>
            <option value="3:4">3:4</option>
            <option value="4:3">4:3</option>
            <option value="4:5">4:5</option>
            <option value="5:4">5:4</option>
            <option value="9:16">9:16</option>
            <option value="16:9">16:9</option>
            <option value="21:9">21:9</option>
          </select>
        </label>

        <label v-if="cfg.config.image.google.nano.model === 'gemini-3-pro-image-preview'" class="field">
          <span>Image size</span>
          <select v-model="cfg.config.image.google.nano.imageSize">
            <option value="1K">1K</option>
            <option value="2K">2K</option>
            <option value="4K">4K</option>
          </select>
        </label>
      </div>
    </div>

    <div v-if="!isStability && !isGoogle" class="grid">
      <label class="field">
        <span>Width</span>
        <input type="number" v-model.number="cfg.config.image.width" />
      </label>

      <label class="field">
        <span>Height</span>
        <input type="number" v-model.number="cfg.config.image.height" />
      </label>

      <label class="field">
        <span>Steps</span>
        <input type="number" v-model.number="cfg.config.image.steps" />
      </label>

      <label class="field">
        <span>CFG</span>
        <input type="number" step="0.5" v-model.number="cfg.config.image.cfgScale" />
      </label>
    </div>

    <div v-if="!isStability && !isGoogle" class="card2">
      <h3>Sampling</h3>

      <div class="row">
        <button @click="connectProvider(cfg.config.image.provider)" :disabled="loadingSS">
          {{ loadingSS ? "Loading..." : "Load samplers & schedulers" }}
        </button>
        <span v-if="ssError" class="bad">{{ ssError }}</span>
        <span v-else-if="ssWarning" class="muted">{{ ssWarning }}</span>
        <span v-else class="muted">
          Fetches options from the selected provider via /api/image/samplers and /api/image/schedulers
        </span>
      </div>

      <div class="grid">
        <label class="field">
          <span>Sampler</span>
          <select v-model="cfg.config.image.sampler">
            <option value="">(default)</option>
            <option v-for="s in samplerOptions" :key="s" :value="s">{{ s }}</option>
          </select>
          <small class="muted">If the list is empty you can still type a value below.</small>
          <input v-model="cfg.config.image.sampler" placeholder="e.g. euler / dpmpp_2m" />
        </label>

        <label class="field">
          <span>Scheduler</span>
          <select v-model="cfg.config.image.scheduler">
            <option value="">(default)</option>
            <option v-for="s in schedulerOptions" :key="s" :value="s">{{ s }}</option>
          </select>
          <small class="muted">If the list is empty you can still type a value below.</small>
          <input v-model="cfg.config.image.scheduler" placeholder="e.g. simple / karras" />
        </label>
      </div>
    </div>

    <div v-if="isStability && cfg.config?.image?.stability" class="card2">
      <h3>Stability</h3>

      <ApiKeySelector
        v-model="stabilityKeyRef"
        provider="stability"
        label="API key"
        :showTest="false"
      />

      <div class="grid">
        <label class="field">
          <span>Aspect ratio</span>
          <select v-model="cfg.config.image.stability.aspectRatio">
            <option value="1:1">1:1</option>
            <option value="2:3">2:3</option>
            <option value="3:2">3:2</option>
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
          </select>
        </label>

        <label class="field">
          <span>Output format</span>
          <select v-model="cfg.config.image.stability.outputFormat">
            <option value="png">png</option>
            <option value="webp">webp</option>
            <option value="jpeg">jpeg</option>
          </select>
        </label>
      </div>
    </div>

    <div v-if="isComfy" class="card2">
      <h3>ComfyUI</h3>

      <div class="row">
        <button @click="loadComfyLists" :disabled="loadingLists">
          {{ loadingLists ? "Loading…" : "Load models & LoRAs" }}
        </button>
        <span v-if="listError" class="bad">{{ listError }}</span>
        <span v-else class="muted">Populates dropdowns from /api/comfyui/models + /api/comfyui/loras</span>
      </div>

      <label class="field">
        <span>Workflow</span>
        <select v-model="cfg.config.image.comfyui.workflow">
          <option v-for="w in workflows" :key="w.name" :value="w.name">{{ w.title }}</option>
        </select>
        <small v-if="workflowError" class="bad">{{ workflowError }}</small>
      </label>

      <div v-if="hasLora" class="grid">
        <label class="field">
          <span>LoRA Strength (Model)</span>
          <input type="number" step="0.05" v-model.number="cfg.config.image.comfyui.loraStrengthModel" />
        </label>

        <label class="field">
          <span>LoRA Strength (CLIP)</span>
          <input type="number" step="0.05" v-model.number="cfg.config.image.comfyui.loraStrengthClip" />
        </label>
      </div>

      <label class="field">
        <span>Model</span>
        <select v-model="cfg.config.image.comfyui.model">
          <option value="">(auto / default)</option>
          <option v-for="m in modelOptions" :key="m" :value="m">{{ m }}</option>
        </select>
      </label>

      <label v-if="hasLora" class="field">
        <span>LoRA</span>
        <select v-model="cfg.config.image.comfyui.loraName">
          <option value="">(none)</option>
          <option v-for="l in loraOptions" :key="l" :value="l">{{ l }}</option>
        </select>
      </label>
    </div>

    <div class="row">
      <button @click="save">Save</button>
      <span class="muted">Saved to server/data/config.json</span>
    </div>
  </div>
</template>


<style scoped>
.card { border: 1px solid var(--border); border-radius: 12px; padding: 16px; background: var(--panel); }
.card2 { margin-top: 12px; border: 1px solid var(--border); border-radius: 12px; padding: 12px; background: var(--panel-2); }
.field { display: grid; gap: 6px; margin: 10px 0; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.row { display: flex; gap: 12px; align-items: center; margin-top: 12px; flex-wrap: wrap; }
input, select { padding: 8px; border-radius: 8px; border: 1px solid var(--border-2); background: var(--panel-3); color: var(--text); }
button { padding: 8px 12px; border-radius: 10px; border: 1px solid var(--border-2); background: var(--accent); color: var(--text); cursor: pointer; }
.muted { color: var(--muted); }
.bad { color: #c94a4a; font-weight: 600; }
.pre { white-space: pre-wrap; font-size: 12px; }
.details { margin-top: 6px; }
</style>
