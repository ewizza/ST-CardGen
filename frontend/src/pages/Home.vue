<script setup lang="ts">
import { ref } from "vue";
import ImageSettingsModal from "@/components/modals/ImageSettingsModal.vue";
import { cancelImageJob, generateImage, waitForImageJob, type ImageJob } from "@/services/image";
import { resolveImageSrc, withCacheBust } from "@/lib/imageUrl";
import { useConfigStore } from "@/stores/configStore";
import { getMissingImageProviderKeyMessage } from "@/lib/imageProviderKey";

const prompt = ref("a cinematic portrait photo of a medieval ranger, shallow depth of field");
const negativePrompt = ref("blurry, low quality, deformed, extra fingers");

const generating = ref(false);
const error = ref<string | null>(null);
const cfg = useConfigStore();

const imageUrl = ref<string | null>(null);
const promptId = ref<string | null>(null);
const seed = ref<number | null>(null);
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
  const missingImageProviderKey = getMissingImageProviderKeyMessage(cfg.config);
  if (missingImageProviderKey) {
    error.value = missingImageProviderKey;
    return;
  }

  generating.value = true;
  try {
    const res = await generateImage({
      prompt: prompt.value,
      negativePrompt: negativePrompt.value,
    });

    if (!res.ok) {
      error.value = res.error ?? "Generation failed.";
      return;
    }

    promptId.value = res.promptId ?? null;
    seed.value = res.seed ?? null;

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
  <main class="wrap">
    <!-- Your existing settings UI -->
    <section class="card">
      <ImageSettingsModal />
    </section>

    <!-- Test generate UI -->
    <section class="card">
      <h2>Generate (test)</h2>

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
          {{ generating ? "Generating…" : "Generate" }}
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
      </div>
    </section>
  </main>
</template>

<style scoped>
.wrap { max-width: 920px; margin: 24px auto; padding: 0 16px; display: grid; gap: 16px; }
.card { border: 1px solid #ddd; border-radius: 12px; padding: 16px; background: #fff; }
.field { display: grid; gap: 6px; margin: 10px 0; }
textarea { padding: 10px; border-radius: 10px; border: 1px solid #ccc; resize: vertical; }
.row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 12px; }
button { padding: 8px 12px; border-radius: 10px; border: 1px solid #bbb; background: #fff; cursor: pointer; }
.ghost { padding: 8px 12px; border-radius: 10px; border: 1px solid #bbb; background: transparent; color: inherit; }
.muted { color: #666; }
.bad { color: #c33; font-weight: 600; margin-top: 10px; }
.result { margin-top: 12px; }
.result img { max-width: 100%; border-radius: 12px; border: 1px solid #eee; }
</style>
