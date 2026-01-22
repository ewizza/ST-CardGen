<script setup lang="ts">
import { ref } from "vue";
import { storeToRefs } from "pinia";
import { cancelImageJob, generateImage, waitForImageJob, type ImageJob } from "@/services/image";
import { resolveImageSrc, withCacheBust } from "@/lib/imageUrl";
import { useGenerateStore } from "@/stores/generateStore";
import { useConfigStore } from "@/stores/configStore";

const { prompt, negativePrompt, seed } = storeToRefs(useGenerateStore());
const cfg = useConfigStore();

const generating = ref(false);
const error = ref<string | null>(null);

const imageUrl = ref<string | null>(null);
const promptId = ref<string | null>(null);
const job = ref<ImageJob | null>(null);
const jobAbort = ref<AbortController | null>(null);

async function onCancelJob() {
  const id = job.value?.id;
  if (id) {
    await cancelImageJob(id).catch(() => {});
  }
  jobAbort.value?.abort();
}

async function onGenerate() {
  error.value = null;
  imageUrl.value = null;
  promptId.value = null;
  seed.value = null;
  job.value = null;
  jobAbort.value?.abort();
  jobAbort.value = null;

  if (!prompt.value.trim()) {
    error.value = "Prompt is required.";
    return;
  }
  if (cfg.config?.image.provider === "stability" && !cfg.config.image.stability?.apiKeyRef) {
    error.value = "Select a Stability API key in Settings before generating.";
    return;
  }
  if (cfg.config?.image.provider === "huggingface" && !cfg.config.image.huggingface?.apiKeyRef) {
    error.value = "Select a Hugging Face API key in Settings before generating.";
    return;
  }

  generating.value = true;
  try {
    const res = await generateImage({
      prompt: prompt.value,
      negativePrompt: negativePrompt.value,
      seed: seed.value ?? undefined,
    });

    if (!res.ok) {
      error.value = res.error ?? "Generation failed.";
      return;
    }

    promptId.value = res.promptId ?? null;
    seed.value = res.seed ?? null;

    // ComfyUI now returns jobId; poll until done
    if (res.jobId) {
      jobAbort.value = new AbortController();
      job.value = { id: res.jobId, state: "queued", progress: 0, message: "Queued" };

      const finalJob = await waitForImageJob(res.jobId, {
        signal: jobAbort.value.signal,
        onUpdate: (j) => (job.value = j),
      });

      const src = resolveImageSrc(finalJob.result?.imageUrl, undefined);
      imageUrl.value = src ? withCacheBust(src) : null;

      if (!imageUrl.value) error.value = "Job completed but no imageUrl was returned.";
      return;
    }

    const src = resolveImageSrc(res.imageUrl, res.imageBase64);
    imageUrl.value = src ? withCacheBust(src) : null;

    if (!imageUrl.value) {
      error.value = "Generation succeeded but no imageUrl was returned.";
    }
  } catch (e: any) {
    error.value = String(e?.message ?? e);
  } finally {
    generating.value = false;
  }
}
</script>

<template>
  <section class="page">
    <h1 class="title">Generate</h1>

    <div class="card">
      <label class="field">
        <span>Prompt</span>
        <textarea v-model="prompt" rows="4" placeholder="Describe the image..."></textarea>
      </label>

      <label class="field">
        <span>Negative prompt</span>
        <textarea v-model="negativePrompt" rows="2" placeholder="What to avoid..."></textarea>
      </label>

      <div class="row">
        <button @click="onGenerate" :disabled="generating">
          {{ generating ? "Generating..." : "Generate" }}
        </button>
        <button
          v-if="job && generating"
          class="ghost"
          @click="onCancelJob()"
          type="button"
        >
          Cancel
        </button>

        <span v-if="promptId" class="muted">prompt_id: {{ promptId }}</span>
        <span v-if="seed !== null" class="muted">seed: {{ seed }}</span>
      </div>

      <p v-if="job" class="muted">
        job: {{ job.id }} • {{ job.state }}
        <span v-if="job.progress !== undefined"> • {{ Math.round(job.progress * 100) }}%</span>
        <span v-if="job.message"> • {{ job.message }}</span>
      </p>

      <p v-if="error" class="bad">{{ error }}</p>

      <div v-if="imageUrl" class="result">
        <img :src="imageUrl" alt="Generated" />
        <small class="muted">src: {{ imageUrl }}</small>
      </div>
    </div>
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
.card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  background: var(--panel);
}
.field {
  display: grid;
  gap: 6px;
  margin: 10px 0;
}
textarea {
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--border-2);
  background: var(--panel-3);
  color: var(--text);
  resize: vertical;
}
.row {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 12px;
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
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--border-2);
  background: transparent;
  color: var(--text);
}
.muted {
  color: var(--muted);
}
.bad {
  color: #c94a4a;
  font-weight: 600;
  margin-top: 10px;
}
.result {
  margin-top: 12px;
}
.result img {
  max-width: 100%;
  border-radius: 12px;
  border: 1px solid var(--border);
}
</style>
