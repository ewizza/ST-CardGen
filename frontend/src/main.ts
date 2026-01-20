import { createApp } from "vue";
import { createPinia } from "pinia";
import "./styles/tailwind.css";
import "./style.css";
import App from "./App.vue";
import router from "./router";

if ("scrollRestoration" in history) history.scrollRestoration = "manual";

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount("#app");
