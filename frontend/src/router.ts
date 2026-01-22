import { createRouter, createWebHistory } from "vue-router";
import CharacterPage from "./pages/CharacterPage.vue";
import GeneratePage from "./pages/GeneratePage.vue";
import LibraryPage from "./pages/LibraryPage.vue";
import SettingsPage from "./pages/SettingsPage.vue";

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) return savedPosition;
    return { left: 0, top: 0 };
  },
  routes: [
    { path: "/", redirect: "/character" },
    { path: "/character", component: CharacterPage },
    { path: "/generate", component: GeneratePage },
    { path: "/library", component: LibraryPage },
    { path: "/settings", component: SettingsPage },
  ],
});

export default router;
