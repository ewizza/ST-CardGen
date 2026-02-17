$ErrorActionPreference = "Stop"

function Write-FileUtf8NoBom([string]$Path, [string]$Content) {
  $dir = Split-Path -Parent $Path
  if ($dir -and !(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Ensure-Dir([string]$Path) {
  if (!(Test-Path $Path)) { New-Item -ItemType Directory -Path $Path | Out-Null }
}

# --- Config ---
$ServerPort = 3001
$FrontendDir = "frontend"
$ServerDir = "server"

# --- Create /server (minimal Express hello endpoint) ---
Ensure-Dir $ServerDir

Write-FileUtf8NoBom "$ServerDir\package.json" @"
{
  "name": "ccg-proxy-server",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "nodemon index.js",
    "start": "node index.js"
  },
  "dependencies": {
    "express": "^4.19.2"
  },
  "devDependencies": {
    "nodemon": "^3.1.4"
  }
}
"@

Write-FileUtf8NoBom "$ServerDir\index.js" @"
import express from "express";

const app = express();
app.use(express.json({ limit: "10mb" }));

// Hello-world wiring endpoint:
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "ccg-proxy-server", ts: new Date().toISOString() });
});

// TODO: add your proxy routes here (image/text adapters)

const port = process.env.PORT ? Number(process.env.PORT) : $ServerPort;
app.listen(port, () => {
  console.log(\`Server listening on http://localhost:\${port}\`);
});
"@

Write-FileUtf8NoBom "$ServerDir\README.md" @"
# Server (Node + Express)
- GET /api/health -> { ok: true, ... }

Replace/extend this with your existing proxy server routes as you migrate.
"@

# --- Create /frontend using Vite (Vue + TS) ---
if (!(Test-Path $FrontendDir)) {
  Ensure-Dir $FrontendDir
  Push-Location $FrontendDir
  # Create a Vite Vue+TS app in-place
  npm create vite@latest . -- --template vue-ts
  Pop-Location
}

# Install deps
Push-Location $FrontendDir
npm install
npm install pinia @vueuse/core
npm install -D vue-tsc
Pop-Location

# --- Overwrite /frontend key files + add stubs ---
Write-FileUtf8NoBom "$FrontendDir\vite.config.ts" @"
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { "@": "/src" } },
  server: {
    proxy: {
      "/api": { target: "http://localhost:$ServerPort", changeOrigin: true },
    },
  },
});
"@

Write-FileUtf8NoBom "$FrontendDir\src\main.ts" @"
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";

createApp(App).use(createPinia()).mount("#app");
"@

Write-FileUtf8NoBom "$FrontendDir\src\App.vue" @"
<script setup lang="ts">
import Home from "./pages/Home.vue";
</script>

<template>
  <Home />
</template>

<style>
html, body { height: 100%; margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
</style>
"@

Ensure-Dir "$FrontendDir\src\pages"
Ensure-Dir "$FrontendDir\src\services"
Ensure-Dir "$FrontendDir\src\models"
Ensure-Dir "$FrontendDir\src\stores"
Ensure-Dir "$FrontendDir\src\components\modals"
Ensure-Dir "$FrontendDir\src\components\controls"
Ensure-Dir "$FrontendDir\src\services\clients"

Write-FileUtf8NoBom "$FrontendDir\src\pages\Home.vue" @"
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useAppStore } from "@/stores/appStore";
import { getHealth } from "@/services/health";

const store = useAppStore();
const healthText = ref<string>("(loading...)");

onMounted(async () => {
  store.setStatus("Booting UI…");
  try {
    const health = await getHealth();
    healthText.value = health.ok ? "ok" : "not ok";
    store.setStatus("Ready");
  } catch {
    healthText.value = "error";
    store.setStatus("Backend unreachable");
  }
});
</script>

<template>
  <main class="wrap">
    <header class="card">
      <h1>CCG Vue Scaffold</h1>
      <p class="muted">Vue 3 + Vite + TypeScript + Pinia</p>
    </header>

    <section class="card">
      <h2>Hello world wiring</h2>
      <p><strong>API Health:</strong> {{ healthText }}</p>
      <p><strong>Store status:</strong> {{ store.status }}</p>

      <details style="margin-top: 12px">
        <summary>Next steps</summary>
        <ul>
          <li>Migrate Image Settings modal into <code>components/modals</code>.</li>
          <li>Move backend-specific calls into <code>services/clients</code>.</li>
          <li>Keep UI state in Pinia; render conditionally from state.</li>
        </ul>
      </details>
    </section>
  </main>
</template>

<style scoped>
.wrap { max-width: 920px; margin: 24px auto; padding: 0 16px; display: grid; gap: 16px; }
.card { border: 1px solid #ddd; border-radius: 12px; padding: 16px; background: #fff; }
.muted { color: #666; margin-top: 6px; }
h1 { margin: 0; font-size: 22px; }
h2 { margin: 0 0 8px; font-size: 18px; }
code { background: #f6f6f6; padding: 2px 6px; border-radius: 6px; }
</style>
"@

Write-FileUtf8NoBom "$FrontendDir\src\services\http.ts" @"
/**
 * Minimal fetch wrapper for consistent error handling.
 * Expand later with timeouts, request IDs, retry/backoff, etc.
 */
export async function httpJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(\`HTTP \${res.status} \${res.statusText} \${text}\`.trim());
  }
  return (await res.json()) as T;
}
"@

Write-FileUtf8NoBom "$FrontendDir\src\services\health.ts" @"
import { httpJson } from "./http";
export type HealthResponse = { ok: boolean; service: string; ts: string };
export function getHealth() {
  return httpJson<HealthResponse>("/api/health");
}
"@

Write-FileUtf8NoBom "$FrontendDir\src\models\Backend.ts" @"
export type ImageBackendType = "sdapi" | "comfyui" | "koboldcpp";
export type TextBackendType  = "openai_compat" | "koboldcpp" | "other";
"@

Write-FileUtf8NoBom "$FrontendDir\src\models\ImageSettings.ts" @"
import type { ImageBackendType } from "./Backend";

export interface ImageSettings {
  backend: ImageBackendType;

  // common
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  sampler?: string;
  scheduler?: string;

  // comfyui-only (phase 1)
  comfyui?: {
    model?: string;
    lora?: string;
    loraStrength?: number;
    clipStrength?: number;
  };
}
"@

Write-FileUtf8NoBom "$FrontendDir\src\models\AppSettings.ts" @"
import type { ImageSettings } from "./ImageSettings";

export interface AppSettings {
  image: ImageSettings;
  // TODO: text backend settings, prompt presets, UI prefs, etc.
}
"@

Write-FileUtf8NoBom "$FrontendDir\src\stores\appStore.ts" @"
import { defineStore } from "pinia";
import { useLocalStorage } from "@vueuse/core";
import type { AppSettings } from "@/models/AppSettings";

function defaultSettings(): AppSettings {
  return {
    image: {
      backend: "sdapi",
      width: 1024,
      height: 1024,
      steps: 30,
      cfgScale: 7,
      sampler: undefined,
      scheduler: undefined,
      comfyui: {
        model: undefined,
        lora: undefined,
        loraStrength: 0.8,
        clipStrength: 1.0,
      },
    },
  };
}

export const useAppStore = defineStore("app", () => {
  const settings = useLocalStorage<AppSettings>("ccg_settings", defaultSettings());
  const status   = useLocalStorage<string>("ccg_status", "Starting…");

  function setStatus(s: string) { status.value = s; }
  function resetSettings()      { settings.value = defaultSettings(); }

  return { settings, status, setStatus, resetSettings };
});
"@

Write-FileUtf8NoBom "$FrontendDir\src\components\modals\ApiSettingsModal.vue" @"
<script setup lang=""ts"">
/** Stub: API Settings modal (text/image endpoints, keys, etc.) */
</script>

<template>
  <div class=""stub""><strong>ApiSettingsModal</strong> (stub)</div>
</template>

<style scoped>
.stub { padding: 12px; border: 1px dashed #aaa; border-radius: 10px; }
</style>
"@

Write-FileUtf8NoBom "$FrontendDir\src\components\modals\ImageSettingsModal.vue" @"
<script setup lang=""ts"">
/** Stub: Image Settings modal (sdapi vs comfyui conditional fields) */
</script>

<template>
  <div class=""stub""><strong>ImageSettingsModal</strong> (stub)</div>
</template>

<style scoped>
.stub { padding: 12px; border: 1px dashed #aaa; border-radius: 10px; }
</style>
"@

Write-FileUtf8NoBom "$FrontendDir\src\components\controls\SamplerSelect.vue" @"
<script setup lang=""ts"">
/**
 * Stub:
 * - Later accepts a list of samplers from a service call.
 * - Emits selected value.
 */
const props = defineProps<{ modelValue?: string; options?: string[] }>();
const emit = defineEmits<{ (e: ""update:modelValue"", v: string | undefined): void }>();
</script>

<template>
  <label class=""field"">
    <span>Sampler</span>
    <select :value=""props.modelValue ?? ''""
      @change=""emit('update:modelValue', ($event.target as HTMLSelectElement).value || undefined)"">
      <option value="""">(default)</option>
      <option v-for=""o in (props.options ?? [])"" :key=""o"" :value=""o"">{{ o }}</option>
    </select>
  </label>
</template>

<style scoped>
.field { display: grid; gap: 6px; }
select { padding: 8px; border-radius: 8px; border: 1px solid #ccc; }
</style>
"@

Write-FileUtf8NoBom "$FrontendDir\src\services\clients\IImageClient.ts" @"
export interface IImageClient {
  listSamplers?(): Promise<string[]>;
  // generateImage(req: GenerateImageRequest): Promise<GenerateImageResponse>;
}
"@

Write-FileUtf8NoBom "$FrontendDir\src\services\ImageService.ts" @"
export class ImageService {
  // TODO: route calls to correct backend client based on store settings
}
"@

Write-FileUtf8NoBom "$FrontendDir\README.md" @"
# Frontend (Vue 3 + Vite + TypeScript)

## Dev
\`\`\`bash
npm install
npm run dev
\`\`\`

## Notes
- \`vite.config.ts\` proxies \`/api/*\` to \`http://localhost:$ServerPort\` by default.
- Global app state lives in Pinia at \`src/stores/appStore.ts\`.
"@

Write-Host "Done."
Write-Host ""
Write-Host "Next:"
Write-Host "  1) cd server   && npm install && npm run dev"
Write-Host "  2) cd frontend && npm run dev"
