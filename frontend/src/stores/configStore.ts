import { defineStore } from "pinia";
import { ref } from "vue";
import { getConfig, putConfig, type AppConfig } from "@/services/config";

export const useConfigStore = defineStore("config", () => {
  const config = ref<AppConfig | null>(null);
  const loading = ref(false);

  async function hydrate() {
    loading.value = true;
    try { config.value = await getConfig(); }
    finally { loading.value = false; }
  }

  async function save() {
    if (!config.value) return;
    config.value = await putConfig(config.value);
  }

  return { config, loading, hydrate, save };
});
