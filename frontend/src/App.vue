<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch, watchEffect } from "vue";
import { useLocalStorage } from "@vueuse/core";
import { useRoute } from "vue-router";
import { useConfigStore } from "@/stores/configStore";
import logoUrl from "@/assets/logo.png";

const cfg = useConfigStore();
const theme = useLocalStorage<"light" | "dark">("ccg_theme", "dark");
const route = useRoute();
const mainRef = ref<HTMLElement | null>(null);
const isDark = computed({
  get: () => theme.value === "dark",
  set: (value: boolean) => { theme.value = value ? "dark" : "light"; },
});

function triggerLibraryRefresh() {
  window.dispatchEvent(new Event("ccg-library-refresh"));
}

onMounted(() => {
  cfg.hydrate();
});

watchEffect(() => {
  document.documentElement.dataset.theme = theme.value;
  document.documentElement.classList.toggle("dark", theme.value === "dark");
});


watch(
  () => route.fullPath,
  async () => {
    await nextTick();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    mainRef.value?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    requestAnimationFrame(() => {
      const topAnchor = document.querySelector("[data-page-top]") as HTMLElement | null;
      topAnchor?.focus?.({ preventScroll: true } as any);
    });
  },
);
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="header-left">
        <img :src="logoUrl" class="logo" alt="Logo" />
        <div class="app-title">SillyTavern Character Generator</div>
      </div>
      <div class="header-right"></div>
    </header>
    <aside class="sidebar">
      
      <nav class="nav">
        <RouterLink to="/character" class="nav-link">Character</RouterLink>
        <RouterLink to="/generate" class="nav-link">Generate</RouterLink>
        <RouterLink to="/library" class="nav-link" @click="triggerLibraryRefresh">Library</RouterLink>
        <RouterLink to="/settings" class="nav-link">Settings</RouterLink>
      </nav>
      <div class="theme-block">
        <div class="theme-label">Theme</div>
        <label class="theme-toggle">
          <input type="checkbox" v-model="isDark" />
          <span class="toggle-track">
            <span class="toggle-label light">Light</span>
            <span class="toggle-label dark">Dark</span>
            <span class="toggle-thumb"></span>
          </span>
        </label>
      </div>
    </aside>
    <main ref="mainRef" class="content">
      
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 220px 1fr;
  grid-template-rows: auto 1fr;
  background: var(--bg);
  position: relative;
  z-index: 1;
}
.app-header {
  grid-column: 1 / -1;
}
.sidebar {
  border-right: 1px solid var(--border);
  background: var(--panel-2-alpha);
  padding: 0px 18px 14px;
}
.brand {
  font-weight: 700;
  letter-spacing: 0.06em;
  margin-bottom: 18px;
}
.nav {
  display: grid;
  gap: 8px;
}
.nav-link {
  display: block;
  padding: 10px 12px;
  border-radius: 10px;
  text-decoration: none;
  color: inherit;
  background: transparent;
  border: 1px solid transparent;
}
.nav-link.router-link-active {
  background: var(--accent);
  border-color: var(--border-2);
}
.content {
  padding: 24px 24px 48px;
  background: var(--panel-alpha);
}
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  min-height: 50px;
  border-bottom: 1px solid var(--border);
  background: var(--panel-2-alpha);
}
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.logo {
  height: 100px;
  width: auto;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.25));
}
.app-title {
  font-size: 36px;
  font-weight: 700;
  letter-spacing: 0.01em;
}
.content-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.01em;
  margin-bottom: 16px;
}
.theme-block {
  margin-top: 18px;
  display: grid;
  gap: 8px;
}
.theme-label {
  font-size: 12px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.theme-toggle input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.toggle-track {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  gap: 6px;
  padding: 6px;
  border-radius: 999px;
  border: 1px solid var(--border-2);
  background: var(--panel-3);
  min-width: 140px;
}
.toggle-label {
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  z-index: 1;
}
.toggle-thumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: calc(50% - 3px);
  border-radius: 999px;
  background: var(--accent);
  border: 1px solid var(--border-2);
  transition: transform 150ms ease;
}
.theme-toggle input:checked + .toggle-track .toggle-thumb {
  transform: translateX(100%);
}
@media (max-width: 800px) {
  .app-shell {
    grid-template-columns: 1fr;
  }
  .sidebar {
    border-right: none;
    border-bottom: 1px solid var(--border);
  }
}
</style>
