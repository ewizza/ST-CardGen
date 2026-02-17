import express from "express";

const app = express();
app.use(express.json({ limit: "10mb" }));

// Hello-world wiring endpoint:
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "ccg-proxy-server", ts: new Date().toISOString() });
});

// TODO: add your proxy routes here (image/text adapters)

const port = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(port, () => {
  console.log(\Server listening on http://localhost:\\);
});