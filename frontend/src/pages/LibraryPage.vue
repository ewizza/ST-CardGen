<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { refDebounced, useLocalStorage } from "@vueuse/core";
import { useRouter } from "vue-router";
import {
  deleteLibraryItem,
  getLibraryConfig,
  listLibrary,
  loadLibraryItem,
  transferLibraryItem,
  type LibraryItem,
  type LibraryRepo,
} from "@/services/library";
import { useCharacterStore } from "@/stores/characterStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import LibraryTransferModal from "@/components/modals/LibraryTransferModal.vue";

const router = useRouter();
const characterStore = useCharacterStore();
const workspaceStore = useWorkspaceStore();

const items = ref<LibraryItem[]>([]);
const dir = ref("");
const repos = ref<LibraryRepo[]>([]);
const currentRepo = ref<LibraryRepo | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const deletingId = ref<string | null>(null);
const selectedRepoId = useLocalStorage<string>("ccg_library_selected_repo_v1", "");
type SortMode = "updated_desc" | "updated_asc" | "name_asc" | "name_desc";

const searchQuery = ref("");
const debouncedSearch = refDebounced(searchQuery, 220);
const sortMode = useLocalStorage<SortMode>("ccg_library_sort_v1", "updated_desc");
const transferOpen = ref(false);
const transferItem = ref<LibraryItem | null>(null);

function norm(s: any) {
  return String(s ?? "").toLowerCase();
}

function updatedTs(item: any) {
  const t = Date.parse(item?.updatedAt ?? "");
  return Number.isFinite(t) ? t : 0;
}

const visibleItems = computed(() => {
  const needle = norm(debouncedSearch.value).trim();
  let list = items.value;

  if (needle) {
    list = list.filter((it) => {
      const hay =
        norm(it.name) +
        " " +
        norm(it.fileBase) +
        " " +
        norm(it.id);
      return hay.includes(needle);
    });
  }

  const out = [...list];
  out.sort((a, b) => {
    if (sortMode.value === "updated_desc") return updatedTs(b) - updatedTs(a);
    if (sortMode.value === "updated_asc") return updatedTs(a) - updatedTs(b);
    if (sortMode.value === "name_asc") return norm(a.name || a.fileBase).localeCompare(norm(b.name || b.fileBase));
    return norm(b.name || b.fileBase).localeCompare(norm(a.name || a.fileBase));
  });

  return out;
});

async function fetchLibrary() {
  loading.value = true;
  error.value = null;
  try {
    const res = await listLibrary(selectedRepoId.value || undefined);
    if (!res.ok) {
      error.value = res.error ?? "Failed to load library.";
      return;
    }
    const stamp = Date.now();
    items.value = (res.items ?? []).map((item) => ({
      ...item,
      pngUrl: item.pngUrl ? `${item.pngUrl}${item.pngUrl.includes("?") ? "&" : "?"}_=${stamp}` : null,
    }));
    dir.value = res.dir ?? "";
    currentRepo.value = res.repo ?? null;
  } catch (e: any) {
    error.value = String(e?.message ?? e);
  } finally {
    loading.value = false;
  }
}

async function fetchLibraryConfig() {
  try {
    const res = await getLibraryConfig();
    if (!res.ok) {
      error.value = res.error ?? "Failed to load library config.";
      return;
    }
    repos.value = res.repositories ?? [];
    const fallbackId = res.activeRepoId || res.repositories?.[0]?.id || "";
    const hasSelected = res.repositories?.some((repo) => repo.id === selectedRepoId.value);
    if (!selectedRepoId.value || !hasSelected) {
      selectedRepoId.value = fallbackId;
    }
  } catch (e: any) {
    error.value = String(e?.message ?? e);
  }
}

async function onOpen(item: LibraryItem) {
  error.value = null;
  notice.value = null;
  try {
    const res = await loadLibraryItem(item.id, selectedRepoId.value || undefined);
    if (!res.ok || !res.cardV2) {
      error.value = res.error ?? "Failed to load card.";
      return;
    }
    workspaceStore.idea = "";
    characterStore.applyCardData(res.cardV2.data);
    if (res.avatarPngUrl) characterStore.avatarUrl = res.avatarPngUrl;
    characterStore.setLibraryContext(selectedRepoId.value || null, item.id);
    router.push("/character");
  } catch (e: any) {
    error.value = String(e?.message ?? e);
  }
}

async function onDelete(item: LibraryItem) {
  if (!window.confirm("Delete? Are you sure?")) return;
  deletingId.value = item.id;
  error.value = null;
  notice.value = null;
  try {
    const res = await deleteLibraryItem(item.id, selectedRepoId.value || undefined);
    if (!res.ok) {
      error.value = res.error ?? "Failed to delete card.";
      return;
    }
    items.value = items.value.filter((entry) => entry.id !== item.id);
    notice.value = "Deleted.";
  } catch (e: any) {
    error.value = String(e?.message ?? e);
  } finally {
    deletingId.value = null;
  }
}

function onTransfer(item: LibraryItem) {
  transferItem.value = item;
  transferOpen.value = true;
}

async function onConfirmTransfer(payload: { toRepoId: string; mode: "copy" | "move"; destFormat: "auto" | "png" | "json" }) {
  if (!transferItem.value) return;
  error.value = null;
  notice.value = null;
  try {
    const res = await transferLibraryItem({
      fromRepoId: selectedRepoId.value || undefined,
      toRepoId: payload.toRepoId,
      id: transferItem.value.id,
      mode: payload.mode,
      destFormat: payload.destFormat,
    });
    if (!res.ok) {
      error.value = res.error ?? "Transfer failed.";
      return;
    }
    const action = payload.mode === "move" ? "Moved" : "Copied";
    notice.value = `${action} to ${payload.toRepoId}.`;
    await fetchLibrary();
  } catch (e: any) {
    error.value = String(e?.message ?? e);
  } finally {
    transferOpen.value = false;
  }
}

onMounted(fetchLibrary);
onMounted(fetchLibraryConfig);

watch(
  () => selectedRepoId.value,
  () => {
    fetchLibrary();
  }
);

function onLibraryRefresh() {
  fetchLibrary();
}

onMounted(() => {
  window.addEventListener("ccg-library-refresh", onLibraryRefresh);
});

onUnmounted(() => {
  window.removeEventListener("ccg-library-refresh", onLibraryRefresh);
});
</script>

<template>
  <section class="page">
    <div data-page-top tabindex="-1" style="outline:none;"></div>
    <div class="header">
      <div>
        <h1>Library</h1>
        <p class="muted">Folder: {{ dir || "Not set" }}</p>
      </div>
      <div class="header-actions">
        <label class="field inline-field">
          <span class="label">Repository</span>
          <select v-model="selectedRepoId">
            <option v-for="repo in repos" :key="repo.id" :value="repo.id">
              {{ repo.name }}
            </option>
          </select>
        </label>
        <div class="controls">
          <input
            v-model="searchQuery"
            class="input"
            placeholder="Search…"
            aria-label="Search library"
          />
          <select v-model="sortMode" class="select" aria-label="Sort library">
            <option value="updated_desc">Updated (newest)</option>
            <option value="updated_asc">Updated (oldest)</option>
            <option value="name_asc">Name (A–Z)</option>
            <option value="name_desc">Name (Z–A)</option>
          </select>
        </div>
        <button class="ghost" @click="fetchLibrary" :disabled="loading">
          {{ loading ? "Refreshing..." : "Refresh" }}
        </button>
      </div>
    </div>

    <p class="muted">{{ visibleItems.length }} / {{ items.length }} items</p>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="notice" class="muted">{{ notice }}</p>

    <div v-if="!visibleItems.length && !loading" class="empty">No saved characters yet.</div>

    <div class="grid">
      <div v-for="item in visibleItems" :key="item.id" class="card" @click="onOpen(item)">
        <div class="thumb">
          <img v-if="item.pngUrl" :src="item.pngUrl" alt="" />
          <div v-else class="placeholder">No image</div>
          <div class="thumbTitle">{{ item.name || item.fileBase || "Unnamed" }}</div>
          <button
            class="trash"
            type="button"
            :disabled="deletingId === item.id"
            @click.stop="onDelete(item)"
            aria-label="Delete"
            v-if="!currentRepo?.readOnly"
          >
            🗑
          </button>
          <button
            class="transfer"
            type="button"
            @click.stop="onTransfer(item)"
            aria-label="Copy or move"
          >
            Transfer
          </button>
        </div>
        <div class="meta">
          <div class="name">{{ item.name || "Untitled" }}</div>
          <div class="muted">{{ new Date(item.updatedAt).toLocaleString() }}</div>
        </div>
      </div>
    </div>
    <LibraryTransferModal
      v-model="transferOpen"
      :item="transferItem"
      :from-repo-id="selectedRepoId"
      :repos="repos"
      @confirm="onConfirmTransfer"
    />
  </section>
</template>

<style scoped>
.page {
  display: grid;
  gap: 16px;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.header-actions {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  flex-wrap: wrap;
}
.controls {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  min-width: min(520px, 100%);
}
.controls .input {
  min-width: 220px;
  flex: 1;
}
.controls .select {
  width: 190px;
}
.field {
  display: grid;
  gap: 6px;
}
.inline-field {
  margin: 0;
  min-width: 180px;
}
.field select,
.field input {
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--border-2);
  background: var(--panel-3);
  color: var(--text);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}
.card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
  overflow: hidden;
  cursor: pointer;
  display: grid;
  gap: 8px;
}
.thumb {
  background: var(--panel-3);
  aspect-ratio: 1 / 1;
  display: grid;
  place-items: center;
  position: relative;
  border-radius: 12px;
  overflow: hidden;
}
.trash {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: rgba(255, 0, 0, 0.2);
  border: 1px solid rgba(255, 0, 0, 0.35);
  color: rgba(255, 255, 255, 0.9);
  border-radius: 10px;
  padding: 6px 8px;
  opacity: 0;
  transition: opacity 120ms ease;
  cursor: pointer;
}
.transfer {
  position: absolute;
  bottom: 8px;
  left: 8px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.9);
  border-radius: 10px;
  padding: 6px 8px;
  opacity: 0;
  transition: opacity 120ms ease;
  cursor: pointer;
}
.card:hover .trash {
  opacity: 1;
}
.card:hover .transfer {
  opacity: 1;
}
.trash:disabled {
  opacity: 0.5;
  cursor: default;
}
.trash:hover:not(:disabled) {
  opacity: 1;
  background: rgba(255, 0, 0, 0.3);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.placeholder {
  color: var(--muted);
  font-size: 13px;
}
.thumbTitle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 8px 10px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.65), rgba(0, 0, 0, 0));
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.meta {
  padding: 10px 12px 14px;
  display: grid;
  gap: 4px;
}
.name {
  font-weight: 600;
}
.muted {
  color: var(--muted);
  font-size: 13px;
}
.label {
  font-size: 12px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.error {
  color: #c94a4a;
  font-weight: 600;
}
.empty {
  color: var(--muted);
  padding: 16px;
  border: 1px dashed var(--border-2);
  border-radius: 12px;
}
.ghost {
  background: transparent;
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
