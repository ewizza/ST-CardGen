import { createApp } from './app.js'
import { migrateSecrets } from "./config/store.js";
import { cleanupOldJobs } from "./domain/jobs/imageJobs.js";

const port = Number(process.env.PORT ?? 3001)

async function start() {
  await migrateSecrets();
  const app = createApp();
  app.listen(port, () => {
    console.log(`CCG server listening on http://localhost:${port}`)
  });
  setInterval(() => cleanupOldJobs(1000 * 60 * 60), 1000 * 60 * 10).unref();
}

start();
