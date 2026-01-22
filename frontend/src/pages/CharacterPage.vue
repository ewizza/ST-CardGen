<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useLocalStorage } from "@vueuse/core";

import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useCharacterStore } from "@/stores/characterStore";
import { fillMissing, generateCharacter, generateImagePrompt, regenerateCharacter } from "@/services/character";
import { cancelImageJob, generateImage, waitForImageJob, type ImageJob } from "@/services/image";
import { saveToLibrary, updateLibraryItem } from "@/services/library";
import { resolveImageSrc, withCacheBust } from "@/lib/imageUrl";
import { useRegenerateStore } from "@/stores/regenerateStore";
import { useConfigStore } from "@/stores/configStore";
import CollapsiblePanel from "@/components/ui/CollapsiblePanel.vue";

const workspaceStore = useWorkspaceStore();
const cfg = useConfigStore();
const {
  idea,
  name: ideaName,
  pov,
  lorebook,
} = storeToRefs(workspaceStore);

const characterStore = useCharacterStore();
const {
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
} = storeToRefs(characterStore);

const tagsInput = computed({
  get: () => (tags.value ?? []).join(", "),
  set: (value: string) => {
    tags.value = normalizeTags(value);
  },
});

const autoImage = useLocalStorage("ccg_auto_image", true);
const libraryFormat = useLocalStorage<"png" | "json">("ccg_library_format", "png");
const libraryTargetRepoId = useLocalStorage("ccg_library_target_repo_v1", "");
const panels = useLocalStorage("ccg_character_panels_v1", {
  inputs: true,
  fields: true,
});
const regenerateStore = useRegenerateStore();
const regen = computed(() => regenerateStore.controls);

const generating = ref(false);
const fillingMissing = ref(false);
const generatingImage = ref(false);
const savingLibrary = ref(false);
const regenerating = ref(false);
const error = ref<string | null>(null);
const fillError = ref<string | null>(null);
const regenError = ref<string | null>(null);
const errorScope = ref<"inputs" | "sidebar" | null>(null);
const regenMaxTokensEnabled = ref(false);
const regenMaxTokens = ref(512);
const regenMaxTokensError = ref<string | null>(null);
const errorRaw = ref<string | null>(null);
const errorIssues = ref<any>(null);
const imageError = ref<string | null>(null);
const imageJob = ref<ImageJob | null>(null);
const imageJobAbort = ref<AbortController | null>(null);
const libraryMessage = ref<string | null>(null);
const showImageOverlay = ref(false);
const showRegenModal = ref(false);
const exportOpen = ref(false);
const ideaEl = ref<HTMLTextAreaElement | null>(null);

const issueText = computed(() =>
  errorIssues.value ? JSON.stringify(errorIssues.value, null, 2) : ""
);

const missingGoogleKey = computed(
  () => cfg.config?.image.provider === "google" && !cfg.config.image.google?.apiKeyRef
);

const libraryRepos = computed(() => cfg.config?.library?.repositories ?? []);
const activeLibraryRepoId = computed(() => cfg.config?.library?.activeRepoId || "cardgen");
const targetLibraryRepoId = computed({
  get: () => libraryTargetRepoId.value || activeLibraryRepoId.value,
  set: (value: string) => { libraryTargetRepoId.value = value; },
});

function repoLabel(id: string) {
  return libraryRepos.value.find((repo) => repo.id === id)?.name || id;
}

async function onGenerate() {
  error.value = null;
  errorRaw.value = null;
  errorIssues.value = null;
  errorScope.value = null;

  if (!idea.value.trim()) {
    error.value = "Character idea is required.";
    errorScope.value = "inputs";
    return;
  }

  generating.value = true;
  try {
    const res = await generateCharacter({
      idea: idea.value,
      name: ideaName.value.trim() || undefined,
      pov: pov.value,
      lorebook: lorebook.value.trim() || undefined,
    });

    if (!res.ok) {
      error.value = res.error ?? "Character generation failed.";
      errorScope.value = "inputs";
      errorRaw.value = res.raw ?? null;
      errorIssues.value = res.issues ?? null;
      return;
    }

    if (!res.character) {
      error.value = "No character payload returned.";
      errorScope.value = "inputs";
      return;
    }

    characterStore.setLibraryContext(null, null);
    characterStore.applyGenerated(res.character);

    if (autoImage.value && image_prompt.value.trim()) {
      await onGenerateImage();
    }
  } catch (e: any) {
    error.value = String(e?.message ?? e);
    errorScope.value = "inputs";
  } finally {
    generating.value = false;
  }
}

function applyRegeneratePatch(patch: any) {
  if (Object.prototype.hasOwnProperty.call(patch, "name")) name.value = patch.name ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "description")) description.value = patch.description ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "personality")) personality.value = patch.personality ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "scenario")) scenario.value = patch.scenario ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "first_mes")) first_mes.value = patch.first_mes ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "mes_example")) {
    mes_example.value = Array.isArray(patch.mes_example)
      ? patch.mes_example.join("\n\n")
      : patch.mes_example ?? "";
  }
  if (Object.prototype.hasOwnProperty.call(patch, "tags")) {
    tags.value = normalizeTags(patch.tags);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "creator_notes")) creator_notes.value = patch.creator_notes ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "image_prompt")) image_prompt.value = patch.image_prompt ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "negative_prompt")) negative_prompt.value = patch.negative_prompt ?? "";
}

type RegenKeep = {
  name: boolean;
  description: boolean;
  personality: boolean;
  scenario: boolean;
  first_mes: boolean;
  mes_example: boolean;
  tags: boolean;
  creator_notes: boolean;
  image_prompt: boolean;
  negative_prompt: boolean;
};

function buildKeepAllTrue(): RegenKeep {
  return {
    name: true,
    description: true,
    personality: true,
    scenario: true,
    first_mes: true,
    mes_example: true,
    tags: true,
    creator_notes: true,
    image_prompt: true,
    negative_prompt: true,
  };
}

function validateRegenMaxTokens(value: number) {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    regenMaxTokensError.value = "Enter an integer between 32 and 4096.";
    return false;
  }
  if (value < 32 || value > 4096) {
    regenMaxTokensError.value = "Must be between 32 and 4096.";
    return false;
  }
  regenMaxTokensError.value = null;
  return true;
}

function clampRegenMaxTokens(value: number) {
  if (!Number.isFinite(value)) return 512;
  return Math.min(4096, Math.max(32, Math.trunc(value)));
}

async function runRegenerate(keep: RegenKeep, keepAvatar: boolean, requestedName?: string) {
  regenError.value = null;
  if (!idea.value.trim()) {
    regenError.value = "Character idea is required.";
    nextTick(() => {
      ideaEl.value?.focus();
      ideaEl.value?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return;
  }

  if (!keepAvatar) {
    avatarUrl.value = null;
  }

  regenerating.value = true;
  try {
    let maxTokens: number | undefined;
    if (regenMaxTokensEnabled.value) {
      if (!validateRegenMaxTokens(regenMaxTokens.value)) return;
      maxTokens = clampRegenMaxTokens(regenMaxTokens.value);
      regenMaxTokens.value = maxTokens;
    }
    const res = await regenerateCharacter({
      idea: idea.value,
      requestedName,
      pov: pov.value,
      lorebook: lorebook.value.trim() || undefined,
      card: buildCardPayload(),
      maxTokens,
      keep,
    });

    if (!res.ok) {
      regenError.value = res.error ?? "Regenerate failed.";
      return;
    }

    const patch = { ...(res.patch ?? {}) };
    if (keep.name) delete patch.name;
    applyRegeneratePatch(patch);
  } catch (e: any) {
    regenError.value = String(e?.message ?? e);
  } finally {
    regenerating.value = false;
  }
}

function onRegenerateBatch() {
  const keepName = regen.value.keepName;
  const keep: RegenKeep = {
    name: keepName,
    description: regen.value.keepDescription,
    personality: regen.value.keepPersonality,
    scenario: regen.value.keepScenario,
    first_mes: regen.value.keepFirstMes,
    mes_example: regen.value.keepMesExample,
    tags: regen.value.keepTags,
    creator_notes: regen.value.keepCreatorNotes,
    image_prompt: regen.value.keepImagePrompt,
    negative_prompt: regen.value.keepNegativePrompt,
  };
  const requestedName = keepName ? undefined : (ideaName.value.trim() || undefined);
  runRegenerate(keep, regen.value.keepAvatar, requestedName);
}

type RegenField =
  | "name"
  | "description"
  | "personality"
  | "scenario"
  | "first_mes"
  | "mes_example"
  | "tags"
  | "creator_notes"
  | "image_prompt"
  | "negative_prompt";

function onRegenerateField(field: RegenField) {
  const keep = buildKeepAllTrue();
  keep[field] = false;
  const requestedName = field === "name" ? (ideaName.value.trim() || undefined) : undefined;
  runRegenerate(keep, true, requestedName);
}

async function onGenerateImage() {
  imageError.value = null;
  imageJob.value = null;
  imageJobAbort.value?.abort();
  imageJobAbort.value = null;
  if (!image_prompt.value.trim()) {
    const ok = await onCreateImagePrompt();
    if (!ok) return;
  }
  if (cfg.config?.image.provider === "stability" && !cfg.config.image.stability?.apiKeyRef) {
    imageError.value = "Select a Stability API key in Settings before generating.";
    return;
  }
  if (cfg.config?.image.provider === "huggingface" && !cfg.config.image.huggingface?.apiKeyRef) {
    imageError.value = "Select a Hugging Face API key in Settings before generating.";
    return;
  }
  if (cfg.config?.image.provider === "google" && !cfg.config.image.google?.apiKeyRef) {
    imageError.value = "Select a Google API key in Settings before generating.";
    return;
  }

  generatingImage.value = true;
  try {
    const res = await generateImage({
      prompt: image_prompt.value,
      negativePrompt: negative_prompt.value || "",
    });

    if (!res.ok) {
      imageError.value = res.error ?? "Image generation failed.";
      return;
    }

    if (res.jobId) {
      imageJobAbort.value = new AbortController();
      imageJob.value = { id: res.jobId, state: "queued", progress: 0, message: "Queued" };

      const finalJob = await waitForImageJob(res.jobId, {
        signal: imageJobAbort.value.signal,
        onUpdate: (j) => (imageJob.value = j),
      });

      const src = resolveImageSrc(finalJob.result?.imageUrl, undefined);
      avatarUrl.value = src ? withCacheBust(src) : null;

      if (!avatarUrl.value) imageError.value = "Job completed but no imageUrl was returned.";
      return;
    }

    const src = resolveImageSrc(res.imageUrl, res.imageBase64);
    avatarUrl.value = src ? withCacheBust(src) : null;
    lastSeed.value = res.seed ?? null;
  } catch (e: any) {
    imageError.value = String(e?.message ?? e);
  } finally {
    generatingImage.value = false;
  }
}

async function onCancelImageJob() {
  const id = imageJob.value?.id;
  if (id) {
    await cancelImageJob(id).catch(() => {});
  }
  imageJobAbort.value?.abort();
}

function isEmptyValue(value: any) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function normalizeTags(value: unknown): string[] {
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
}

function applyPatchIfEmpty(patch: any) {
  if (patch.description && isEmptyValue(description.value)) description.value = patch.description;
  if (patch.personality && isEmptyValue(personality.value)) personality.value = patch.personality;
  if (patch.scenario && isEmptyValue(scenario.value)) scenario.value = patch.scenario;
  if (patch.first_mes && isEmptyValue(first_mes.value)) first_mes.value = patch.first_mes;
  if (patch.mes_example && isEmptyValue(mes_example.value)) {
    mes_example.value = Array.isArray(patch.mes_example)
      ? patch.mes_example.join("\n\n")
      : patch.mes_example;
  }
  if (patch.creator_notes && isEmptyValue(creator_notes.value)) creator_notes.value = patch.creator_notes;
  if (Object.prototype.hasOwnProperty.call(patch, "tags") && isEmptyValue(tags.value)) {
    tags.value = normalizeTags(patch.tags);
  }
}

async function onFillMissing() {
  fillError.value = null;
  if (!name.value && !description.value && !personality.value && !scenario.value && !first_mes.value && !mes_example.value) {
    fillError.value = "Please generate or enter at least one field first.";
    return;
  }

  fillingMissing.value = true;
  try {
    const res = await fillMissing({
      card: buildCardPayload(),
      idea: idea.value.trim() || undefined,
      lorebook: lorebook.value.trim() || undefined,
      pov: pov.value,
    });

    if (!res.ok) {
      fillError.value = res.error ?? "Fill missing failed.";
      return;
    }

    applyPatchIfEmpty(res.patch ?? {});
  } catch (e: any) {
    fillError.value = String(e?.message ?? e);
  } finally {
    fillingMissing.value = false;
  }
}

async function onCreateImagePrompt() {
  imageError.value = null;
  try {
    const res = await generateImagePrompt({
      card: {
        name: name.value,
        description: description.value,
        personality: personality.value,
        scenario: scenario.value,
        tags: tags.value,
        creator_notes: creator_notes.value,
      },
    });

    if (!res.ok) {
      imageError.value = res.error ?? "Image prompt generation failed.";
      return false;
    }

    if (res.image_prompt) image_prompt.value = res.image_prompt;
    if (isEmptyValue(negative_prompt.value) && res.negative_prompt) {
      negative_prompt.value = res.negative_prompt;
    }
    return true;
  } catch (e: any) {
    imageError.value = String(e?.message ?? e);
    return false;
  }
}

const importing = ref(false);
const importError = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

function buildCardPayload() {
  return {
    name: name.value,
    description: description.value,
    personality: personality.value,
    scenario: scenario.value,
    first_mes: first_mes.value,
    mes_example: mes_example.value,
    tags: tags.value ?? [],
    creator_notes: creator_notes.value,
    image_prompt: image_prompt.value,
    negative_prompt: negative_prompt.value,
  };
}

function getFilenameFromResponse(res: Response, fallback: string) {
  const header = res.headers.get("content-disposition") || "";
  const match = header.match(/filename="([^"]+)"/i);
  return match?.[1] || fallback;
}

async function downloadFromEndpoint(url: string, body: any, fallbackName: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const disposition = res.headers.get("content-disposition");
  if (!disposition) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "Export failed.");
  }
  const blob = await res.blob();
  const filename = getFilenameFromResponse(res, fallbackName);
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

async function onExportJson() {
  error.value = null;
  errorScope.value = null;
  try {
    const payload = buildCardPayload();
    await downloadFromEndpoint("/api/cards/export/json", { card: payload }, "character.json");
  } catch (e: any) {
    error.value = String(e?.message ?? e);
    errorScope.value = "sidebar";
  }
}

async function onExportPng() {
  error.value = null;
  errorScope.value = null;
  try {
    if (!avatarUrl.value) throw new Error("No avatar image to export.");
    const payload = buildCardPayload();
    await downloadFromEndpoint("/api/cards/export/png", {
      card: payload,
      avatarUrl: avatarUrl.value,
    }, "character.png");
  } catch (e: any) {
    error.value = String(e?.message ?? e);
    errorScope.value = "sidebar";
  }
}

async function onExportAvatar() {
  error.value = null;
  errorScope.value = null;
  try {
    if (!avatarUrl.value) throw new Error("No avatar image to export.");
    await downloadFromEndpoint("/api/cards/export/avatar", {
      avatarUrl: avatarUrl.value,
    }, "avatar.png");
  } catch (e: any) {
    error.value = String(e?.message ?? e);
    errorScope.value = "sidebar";
  }
}

async function onSaveNewToLibrary() {
  libraryMessage.value = null;
  error.value = null;
  errorScope.value = null;
  if (!window.confirm("Save new card?")) return;
  if (libraryFormat.value === "png" && !avatarUrl.value) {
    error.value = "No avatar image to save as PNG.";
    errorScope.value = "sidebar";
    return;
  }
  savingLibrary.value = true;
  try {
    const payload = buildCardPayload();
    const repoId = targetLibraryRepoId.value;
    const res = await saveToLibrary(payload, avatarUrl.value ?? null, libraryFormat.value, repoId);
    if (!res.ok) {
      error.value = res.error ?? "Failed to save to library.";
      errorScope.value = "sidebar";
      return;
    }
    libraryMessage.value = `Saved to ${repoLabel(repoId)}`;
  } catch (e: any) {
    error.value = String(e?.message ?? e);
    errorScope.value = "sidebar";
  } finally {
    savingLibrary.value = false;
  }
}

async function onUpdateLibrary() {
  libraryMessage.value = null;
  error.value = null;
  errorScope.value = null;
  if (!libraryId.value) {
    error.value = "No library item selected to update.";
    errorScope.value = "sidebar";
    return;
  }
  if (libraryFormat.value === "png" && !avatarUrl.value) {
    error.value = "No avatar image to save as PNG.";
    errorScope.value = "sidebar";
    return;
  }
  savingLibrary.value = true;
  try {
    const payload = buildCardPayload();
    const repoId = libraryRepoId.value || targetLibraryRepoId.value;
    const res = await updateLibraryItem(libraryId.value, payload, avatarUrl.value ?? null, libraryFormat.value, repoId);
    if (!res.ok) {
      error.value = res.error ?? "Failed to update library item.";
      errorScope.value = "sidebar";
      return;
    }
    libraryMessage.value = `Updated in ${repoLabel(repoId)}`;
  } catch (e: any) {
    error.value = String(e?.message ?? e);
    errorScope.value = "sidebar";
  } finally {
    savingLibrary.value = false;
  }
}

function onResetCharacter() {
  characterStore.reset();
  idea.value = "";
  error.value = null;
  errorScope.value = null;
  regenError.value = null;
  fillError.value = null;
  imageError.value = null;
  libraryMessage.value = null;
}

const regenSummary = computed(() => {
  const targets: string[] = [];
  if (!regen.value.keepName) targets.push("name");
  if (!regen.value.keepDescription) targets.push("description");
  if (!regen.value.keepPersonality) targets.push("personality");
  if (!regen.value.keepScenario) targets.push("scenario");
  if (!regen.value.keepFirstMes) targets.push("first message");
  if (!regen.value.keepMesExample) targets.push("example messages");
  if (!regen.value.keepTags) targets.push("tags");
  if (!regen.value.keepCreatorNotes) targets.push("creator notes");
  if (!regen.value.keepImagePrompt) targets.push("image prompt");
  if (!regen.value.keepNegativePrompt) targets.push("negative prompt");
  return targets.length ? `Regenerate will update: ${targets.join(", ")}` : "Regenerate will not change any fields.";
});

const regenSelect = {
  name: computed({
    get: () => !regen.value.keepName,
    set: (value: boolean) => { regen.value.keepName = !value; },
  }),
  description: computed({
    get: () => !regen.value.keepDescription,
    set: (value: boolean) => { regen.value.keepDescription = !value; },
  }),
  personality: computed({
    get: () => !regen.value.keepPersonality,
    set: (value: boolean) => { regen.value.keepPersonality = !value; },
  }),
  scenario: computed({
    get: () => !regen.value.keepScenario,
    set: (value: boolean) => { regen.value.keepScenario = !value; },
  }),
  firstMes: computed({
    get: () => !regen.value.keepFirstMes,
    set: (value: boolean) => { regen.value.keepFirstMes = !value; },
  }),
  mesExample: computed({
    get: () => !regen.value.keepMesExample,
    set: (value: boolean) => { regen.value.keepMesExample = !value; },
  }),
  tags: computed({
    get: () => !regen.value.keepTags,
    set: (value: boolean) => { regen.value.keepTags = !value; },
  }),
  creatorNotes: computed({
    get: () => !regen.value.keepCreatorNotes,
    set: (value: boolean) => { regen.value.keepCreatorNotes = !value; },
  }),
  imagePrompt: computed({
    get: () => !regen.value.keepImagePrompt,
    set: (value: boolean) => { regen.value.keepImagePrompt = !value; },
  }),
  negativePrompt: computed({
    get: () => !regen.value.keepNegativePrompt,
    set: (value: boolean) => { regen.value.keepNegativePrompt = !value; },
  }),
};

function openRegenModal() {
  regenError.value = null;
  showRegenModal.value = true;
}

function confirmRegenerate() {
  showRegenModal.value = false;
  onRegenerateBatch();
}

function toggleExportMenu() {
  exportOpen.value = !exportOpen.value;
}

function onWindowClick() {
  exportOpen.value = false;
}

function onImportClick() {
  importError.value = null;
  fileInput.value?.click();
}

function applyImportedData(data: any) {
  characterStore.applyCardData(data);
}

async function onImportFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  importing.value = true;
  importError.value = null;
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/cards/import", { method: "POST", body: form });
    const data = await res.json();
    if (!data.ok) {
      importError.value = data.error ?? "Import failed.";
      return;
    }
    applyImportedData(data.cardV2?.data ?? {});
    if (data.avatarDataUrl) {
      avatarUrl.value = data.avatarDataUrl;
    }
    characterStore.setLibraryContext(null, null);
  } catch (e: any) {
    importError.value = String(e?.message ?? e);
  } finally {
    importing.value = false;
    input.value = "";
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    showImageOverlay.value = false;
    showRegenModal.value = false;
    exportOpen.value = false;
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  window.addEventListener("click", onWindowClick);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  window.removeEventListener("click", onWindowClick);
});
</script>

<template>
  <section class="page">
    <div data-page-top tabindex="-1" style="outline:none;"></div>
    <div class="top">
      <div class="title">
        <h1>Character Workspace</h1>
        <p class="subtle">Generate a SillyTavern-ready character, then refine and export.</p>
      </div>
      <label class="toggle">
        <input type="checkbox" v-model="autoImage" />
        Auto-generate image
      </label>
    </div>

    <div class="layout grid gap-4 lg:grid-cols-12">
      <aside class="sidebar col-span-12 lg:col-span-4 lg:order-2">
        <div class="card">
          <h2>Avatar</h2>
          <div class="avatar">
            <div class="avatar-wrap">
              <img
                v-if="avatarUrl"
                :src="avatarUrl"
                alt="Avatar preview"
                class="avatarImg avatar-img"
                @click="showImageOverlay = true"
              />
              <div v-else class="placeholder avatar-placeholder">No image yet</div>

              <div v-if="generatingImage && imageJob" class="avatar-overlay">
                <div class="avatar-overlay-card">
                  <div class="spinner"></div>
                  <div class="overlay-text">
                    <div class="overlay-title">
                      {{ imageJob.state }}
                      <span v-if="imageJob.progress !== undefined"> • {{ Math.round(imageJob.progress * 100) }}%</span>
                    </div>
                    <div v-if="imageJob.message" class="overlay-sub">{{ imageJob.message }}</div>
                  </div>
                  <button class="btn-ghost" type="button" @click="onCancelImageJob()">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
          <p v-if="lastSeed !== null" class="help">seed: {{ lastSeed }}</p>
          <p v-if="regenerating" class="pill regen-status">
            <svg class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" opacity="0.25" />
              <path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            Regenerating…
          </p>
        </div>

        <div class="card actions">
          <h2>Tools</h2>

          <div class="actions-group">
            <div class="actions-title">Image</div>
            <div class="actions-row">
              <button class="btn-ghost" @click="onCreateImagePrompt">Create image prompt</button>
              <button class="btn-primary" @click="onGenerateImage" :disabled="generatingImage || missingGoogleKey">
                {{ generatingImage ? "Generating image..." : "Generate image" }}
              </button>
            </div>
            <p v-if="missingGoogleKey" class="alert-error">Select a Google API key in Settings to generate images.</p>
          </div>

          <div class="actions-group">
            <div class="actions-title">Library</div>
            <div class="actions-row">
              <button
                v-if="libraryId"
                class="btn-primary"
                @click="onUpdateLibrary"
                :disabled="savingLibrary"
              >
                {{ savingLibrary ? "Saving..." : "Update Library Item" }}
              </button>
              <button
                v-else
                class="btn-primary"
                @click="onSaveNewToLibrary"
                :disabled="savingLibrary"
              >
                {{ savingLibrary ? "Saving..." : "Save to Library" }}
              </button>
              <label class="field inline-field">
                <span class="label">Repository</span>
                <select v-model="targetLibraryRepoId" class="select">
                  <option v-for="repo in libraryRepos" :key="repo.id" :value="repo.id">
                    {{ repo.name }}
                  </option>
                </select>
              </label>
              <label class="field inline-field">
                <span class="label">Library Save Format</span>
                <select v-model="libraryFormat" class="select">
                  <option value="png" :disabled="!avatarUrl">PNG Card</option>
                  <option value="json">JSON Only</option>
                </select>
              </label>
            </div>
            <div v-if="libraryId" class="actions-row">
              <button
                class="btn-primary"
                @click="onSaveNewToLibrary"
                :disabled="savingLibrary"
              >
                {{ savingLibrary ? "Saving..." : "Save New to Library" }}
              </button>
            </div>
          </div>

          <div class="actions-group">
            <div class="actions-title">Export / Import</div>
            <div class="actions-row">
              <div class="dropdown">
                <button class="btn-primary" type="button" @click.stop="toggleExportMenu">
                  Export ▾
                </button>
                <div v-if="exportOpen" class="dropdown-menu" @click.stop>
                  <button class="dropdown-item" @click="exportOpen = false; onExportJson()">
                    Export JSON
                  </button>
                  <button class="dropdown-item" @click="exportOpen = false; onExportPng()">
                    Export PNG Card
                  </button>
                  <button class="dropdown-item" @click="exportOpen = false; onExportAvatar()">
                    Export Avatar PNG
                  </button>
                </div>
              </div>
              <button class="btn-ghost" @click="onImportClick" :disabled="importing">
                {{ importing ? "Importing..." : "Import" }}
              </button>
            </div>
            <input
              ref="fileInput"
              type="file"
              accept=".json,.png"
              class="visually-hidden"
              @change="onImportFileChange"
            />
          </div>

          <p v-if="error && errorScope === 'sidebar'" class="alert-error">{{ error }}</p>
          <p v-if="libraryMessage" class="muted">{{ libraryMessage }}</p>
          <p v-if="importError" class="alert-error">{{ importError }}</p>
          <p v-if="imageError" class="alert-error">{{ imageError }}</p>
        </div>
      </aside>

      <div class="leftCol col-span-12 lg:col-span-8 lg:order-1">
        <div class="card">
          <CollapsiblePanel v-model="panels.inputs" title="Inputs">
            <label class="field">
              <span class="label">Character idea</span>
              <textarea ref="ideaEl" v-model="idea" rows="4" class="textarea" placeholder="Describe the character concept..."></textarea>
            </label>
            <p v-if="regenError === 'Character idea is required.'" class="alert-error">
              Character idea is required to regenerate.
            </p>

            <div class="grid-two">
              <label class="field">
                <span class="label">Name (optional)</span>
                <input v-model="ideaName" class="input" type="text" placeholder="Name (optional)" />
              </label>

              <label class="field">
                <span class="label">POV</span>
                <select v-model="pov" class="select">
                  <option value="first">First person</option>
                  <option value="second">Second person</option>
                  <option value="third">Third person</option>
                </select>
              </label>
            </div>

            <div class="field">
              <span class="label">Max tokens (regen only)</span>
              <div class="flex flex-wrap items-center gap-3">
                <label class="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" v-model="regenMaxTokensEnabled" />
                  <span class="help">Enable</span>
                </label>
                <input
                  v-model.number="regenMaxTokens"
                  type="number"
                  min="32"
                  max="4096"
                  step="1"
                  class="input w-28"
                  :disabled="!regenMaxTokensEnabled"
                  @input="validateRegenMaxTokens(regenMaxTokens)"
                  @blur="regenMaxTokens = clampRegenMaxTokens(regenMaxTokens)"
                />
                <span
                  class="help"
                  title="Applies only to regenerating selected fields. Full character generation ignores this setting."
                >ⓘ</span>
              </div>
              <p v-if="regenMaxTokensEnabled && regenMaxTokensError" class="alert-error">
                {{ regenMaxTokensError }}
              </p>
            </div>

            <details class="details">
              <summary>Lorebook (optional)</summary>
              <label class="field">
                <span class="label">Extra lore, world info, or constraints</span>
                <textarea v-model="lorebook" rows="4" class="textarea" placeholder="Lorebook snippets..."></textarea>
              </label>
            </details>

            <div class="inputs-actions">
              <button class="btn-primary w-full" @click="onGenerate" :disabled="generating">
                {{ generating ? "Generating..." : "Generate" }}
              </button>

              <div class="actions-row">
                <button class="btn-ghost" @click="onFillMissing" :disabled="fillingMissing">
                  {{ fillingMissing ? "Filling..." : "Fill missing fields" }}
                </button>

                <button class="btn-ghost" @click="openRegenModal" :disabled="regenerating">
                  <svg v-if="regenerating" class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" opacity="0.25" />
                    <path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
                  <svg v-else class="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M20 6v5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    <path d="M20 11a8 8 0 1 0 2 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
                  {{ regenerating ? "Regenerating..." : "Regenerate..." }}
                </button>
              </div>

              <p v-if="error && errorScope === 'inputs'" class="alert-error">{{ error }}</p>
              <p v-if="fillError" class="alert-error">{{ fillError }}</p>
              <p v-if="regenError" class="alert-error">{{ regenError }}</p>

              <details v-if="(errorRaw || issueText) && errorScope === 'inputs'" class="details">
                <summary>Details</summary>
                <pre v-if="issueText">{{ issueText }}</pre>
                <pre v-if="errorRaw">{{ errorRaw }}</pre>
              </details>
            </div>
          </CollapsiblePanel>
        </div>

        <div :class="['fieldsPanelWrap', { grow: panels.fields }]">
          <div class="card">
            <CollapsiblePanel v-model="panels.fields" title="Character Fields">
              <div class="card-header">
                <button class="btn-ghost" @click="onResetCharacter">Reset Character</button>
              </div>

          <div class="grid-two">
            <label class="field">
              <div class="field-head">
                <span class="label">Name</span>
                <button
                  class="regen-btn h-8 w-8 inline-flex items-center justify-center"
                  type="button"
                  @click.stop="onRegenerateField('name')"
                  :disabled="regenerating"
                >
                  <svg v-if="regenerating" class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" opacity="0.25" />
                    <path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
                  <svg v-else class="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M20 6v5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    <path d="M20 11a8 8 0 1 0 2 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
                </button>
              </div>
              <input v-model="name" class="input" type="text" />
            </label>
            <label class="field">
              <div class="field-head">
                <span class="label">Tags (comma-separated)</span>
                <button
                  class="regen-btn h-8 w-8 inline-flex items-center justify-center"
                  type="button"
                  @click.stop="onRegenerateField('tags')"
                  :disabled="regenerating"
                >
                  <svg v-if="regenerating" class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" opacity="0.25" />
                    <path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
                  <svg v-else class="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M20 6v5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    <path d="M20 11a8 8 0 1 0 2 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
                </button>
              </div>
              <input v-model="tagsInput" class="input" type="text" placeholder="fantasy, ranger, stoic" />
            </label>
          </div>

          <label class="field">
            <div class="field-head">
              <span class="label">Description</span>
              <button
                class="regen-btn h-8 w-8 inline-flex items-center justify-center"
                type="button"
                @click.stop="onRegenerateField('description')"
                :disabled="regenerating"
              >
                <svg v-if="regenerating" class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" opacity="0.25" />
                    <path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
                  <svg v-else class="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M20 6v5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    <path d="M20 11a8 8 0 1 0 2 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
              </button>
            </div>
            <textarea v-model="description" rows="4" class="textarea"></textarea>
          </label>

          <label class="field">
            <div class="field-head">
              <span class="label">Personality</span>
              <button
                class="regen-btn h-8 w-8 inline-flex items-center justify-center"
                type="button"
                @click.stop="onRegenerateField('personality')"
                :disabled="regenerating"
              >
                <svg v-if="regenerating" class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" opacity="0.25" />
                    <path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
                  <svg v-else class="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M20 6v5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    <path d="M20 11a8 8 0 1 0 2 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
              </button>
            </div>
            <textarea v-model="personality" rows="4" class="textarea"></textarea>
          </label>

          <label class="field">
            <div class="field-head">
              <span class="label">Scenario</span>
              <button
                class="regen-btn h-8 w-8 inline-flex items-center justify-center"
                type="button"
                @click.stop="onRegenerateField('scenario')"
                :disabled="regenerating"
              >
                <svg v-if="regenerating" class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" opacity="0.25" />
                    <path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
                  <svg v-else class="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M20 6v5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    <path d="M20 11a8 8 0 1 0 2 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
              </button>
            </div>
            <textarea v-model="scenario" rows="4" class="textarea"></textarea>
          </label>

          <label class="field">
            <div class="field-head">
              <span class="label">First message</span>
              <button
                class="regen-btn h-8 w-8 inline-flex items-center justify-center"
                type="button"
                @click.stop="onRegenerateField('first_mes')"
                :disabled="regenerating"
              >
                <svg v-if="regenerating" class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" opacity="0.25" />
                    <path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
                  <svg v-else class="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M20 6v5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    <path d="M20 11a8 8 0 1 0 2 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
              </button>
            </div>
            <textarea v-model="first_mes" rows="4" class="textarea"></textarea>
          </label>

          <label class="field">
            <div class="field-head">
              <span class="label">Example messages</span>
              <button
                class="regen-btn h-8 w-8 inline-flex items-center justify-center"
                type="button"
                @click.stop="onRegenerateField('mes_example')"
                :disabled="regenerating"
              >
                <svg v-if="regenerating" class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" opacity="0.25" />
                    <path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
                  <svg v-else class="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M20 6v5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    <path d="M20 11a8 8 0 1 0 2 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
              </button>
            </div>
            <textarea v-model="mes_example" rows="5" class="textarea"></textarea>
          </label>

          <label class="field">
            <div class="field-head">
              <span class="label">Creator notes</span>
              <button
                class="regen-btn h-8 w-8 inline-flex items-center justify-center"
                type="button"
                @click.stop="onRegenerateField('creator_notes')"
                :disabled="regenerating"
              >
                <svg v-if="regenerating" class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" opacity="0.25" />
                    <path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
                  <svg v-else class="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M20 6v5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    <path d="M20 11a8 8 0 1 0 2 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
              </button>
            </div>
            <textarea v-model="creator_notes" rows="3" class="textarea"></textarea>
          </label>

          <label class="field">
            <div class="field-head">
              <span class="label">Image prompt</span>
              <button
                class="regen-btn h-8 w-8 inline-flex items-center justify-center"
                type="button"
                @click.stop="onRegenerateField('image_prompt')"
                :disabled="regenerating"
              >
                <svg v-if="regenerating" class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" opacity="0.25" />
                    <path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
                  <svg v-else class="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M20 6v5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    <path d="M20 11a8 8 0 1 0 2 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
              </button>
            </div>
            <textarea v-model="image_prompt" rows="3" class="textarea"></textarea>
          </label>

            <label class="field">
              <span class="label">Negative prompt</span>
              <textarea v-model="negative_prompt" rows="3" class="textarea"></textarea>
            </label>
            </CollapsiblePanel>
          </div>
        </div>
      </div>
    </div>
    <div v-if="showRegenModal" class="modalOverlay" @click.self="showRegenModal = false">
      <div class="modal">
        <div class="modalHeader">
          <h3>Regenerate Fields</h3>
          <button class="btn-ghost" @click="showRegenModal = false" aria-label="Close">X</button>
        </div>
        <p class="help">{{ regenSummary }}</p>
        <div class="check-grid modal-grid">
          <label class="check"><input type="checkbox" v-model="regenSelect.name" />Name</label>
          <label class="check"><input type="checkbox" v-model="regenSelect.description" />Description</label>
          <label class="check"><input type="checkbox" v-model="regenSelect.personality" />Personality</label>
          <label class="check"><input type="checkbox" v-model="regenSelect.scenario" />Scenario</label>
          <label class="check"><input type="checkbox" v-model="regenSelect.firstMes" />First message</label>
          <label class="check"><input type="checkbox" v-model="regenSelect.mesExample" />Example messages</label>
          <label class="check"><input type="checkbox" v-model="regenSelect.tags" />Tags</label>
          <label class="check"><input type="checkbox" v-model="regenSelect.creatorNotes" />Creator notes</label>
          <label class="check"><input type="checkbox" v-model="regenSelect.imagePrompt" />Image prompt</label>
          <label class="check"><input type="checkbox" v-model="regenSelect.negativePrompt" />Negative prompt</label>
        </div>
        <label class="check keep-avatar">
          <input type="checkbox" v-model="regen.keepAvatar" />Keep avatar
        </label>
        <div class="modalActions">
          <button class="btn-ghost" @click="showRegenModal = false">Cancel</button>
          <button class="btn-primary" @click="confirmRegenerate" :disabled="regenerating">
            <svg v-if="regenerating" class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" opacity="0.25" />
              <path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            <svg v-else class="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 6v5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M20 11a8 8 0 1 0 2 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            {{ regenerating ? "Regenerating..." : "Regenerate selected" }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showImageOverlay" class="overlay" @click.self="showImageOverlay = false">
      <button class="overlayClose" @click="showImageOverlay = false" aria-label="Close">X</button>
      <img class="overlayImg" :src="avatarUrl ?? undefined" alt="Avatar full size" />
    </div>
  </section>
</template>

<style scoped>
.page {
  display: grid;
  gap: 20px;
}
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.title h1 {
  margin: 0 0 6px;
  font-size: 28px;
}
.subtle {
  color: var(--muted);
  margin: 0;
}
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.layout {
  min-height: 0;
}
.leftCol {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: stretch;
  min-height: 0;
}
.fieldsPanelWrap {
  flex: 0 0 auto;
  min-height: 0;
}
.fieldsPanelWrap.grow {
  flex: 1 1 auto;
  min-height: 0;
}
.fieldsPanelWrap.grow :deep(.panelBody) {
  overflow: auto;
  min-height: 0;
}
.sidebar {
  display: grid;
  gap: 20px;
  align-content: start;
  position: sticky;
  top: 16px;
  align-self: start;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.field {
  display: grid;
  gap: 6px;
  margin: 10px 0;
}
.field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.regen-btn {
  border: 1px solid transparent;
  background: transparent;
  color: var(--muted);
  padding: 4px 8px;
  border-radius: 999px;
  opacity: 0;
}
.regenErrorInline {
  margin-top: 8px;
}
.field:hover .regen-btn,
.regen-btn:focus-visible {
  opacity: 1;
  color: var(--text);
  border-color: var(--border-2);
}
.grid-two {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
}
.actions {
  display: grid;
  gap: 12px;
}
.actions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.actions-group {
  display: grid;
  gap: 8px;
}
.inputs-actions {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border-2);
  display: grid;
  gap: 10px;
}
.actions-title {
  font-size: 12px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.dropdown {
  position: relative;
}
.dropdown-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 6px;
  min-width: 180px;
  z-index: 10;
  box-shadow: 0 10px 30px var(--shadow);
}
.dropdown-item {
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  background: transparent;
  border: 1px solid transparent;
}
.dropdown-item:hover {
  background: var(--panel-3);
  border-color: var(--border-2);
}
.inline-field {
  margin: 0;
  min-width: 180px;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.details {
  margin-top: 10px;
}
pre {
  white-space: pre-wrap;
  background: var(--panel-3);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  color: var(--text);
}
.check-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  margin-top: 12px;
}
.modal-grid {
  margin-top: 8px;
}
.check {
  display: flex;
  align-items: center;
  gap: 8px;
}
.keep-avatar {
  margin-top: 12px;
}
.avatar {
  border: 1px dashed var(--border-2);
  border-radius: 12px;
  padding: 10px;
  min-height: 220px;
  display: grid;
  place-items: center;
}
.avatar img {
  max-width: 100%;
  border-radius: 10px;
}
.avatarImg {
  cursor: zoom-in;
}
.avatar-wrap {
  position: relative;
  display: inline-block;
}
.avatar-img {
  display: block;
}
.avatar-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 12px;
}
.avatar-overlay-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(20, 20, 20, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.12);
  max-width: 90%;
}
.overlay-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.overlay-title {
  font-weight: 600;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.overlay-sub {
  font-size: 12px;
  opacity: 0.85;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.spinner {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-top-color: rgba(255, 255, 255, 0.9);
  animation: spin 0.9s linear infinite;
}
.placeholder {
  color: var(--muted);
  font-size: 14px;
}
.muted {
  color: var(--muted);
}
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
  width: min(680px, 92vw);
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
@keyframes spin {
  to { transform: rotate(360deg); }
}
.modalActions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 24px;
}
.overlayImg {
  max-width: 100%;
  max-height: 100%;
  border-radius: 12px;
  box-shadow: 0 20px 60px var(--shadow);
}
.overlayClose {
  position: absolute;
  top: 18px;
  right: 18px;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 1px solid var(--border-2);
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  font-size: 20px;
  cursor: pointer;
}
@media (max-width: 980px) {
  .layout {
    grid-template-columns: 1fr;
  }
  .sidebar {
    position: static;
  }
}
</style>
