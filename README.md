# SillyTavern Character Generator (ST-CardGen)

<p align="center">
  <img src="docs/images/logo.png" alt="ST-CardGen Logo" width="360" />
</p>

A local-first Character Card Generator for **SillyTavern**.  
Create characters from an idea prompt, generate an avatar image, edit fields, and export/import **SillyTavern-compatible JSON + PNG cards**.

Built with:
- **Vue 3 + Vite + TypeScript** frontend
- **Node + Express + TypeScript** backend
- Provider system for **Text Completion** + **Image Generation**
- API key storage via OS keychain when available; falls back to local config.local.json (git-ignored)

---

## Highlights ##

-  **Stable Diffusion API (SDAPI)** image provider added (Automatic1111-style endpoints) 
-  **ComfyUI progress + cancel** during image generation (UI shows in-progress state and lets you stop jobs)
-  **Text provider request timeouts** + clearer errors (KoboldCPP / OpenAI-compatible / Gemini)
-  **Character Field Detail presets**: **Short / Detailed / Verbose** + **per-field overrides** for more detailed character fields 
-  **Library repositories**: multiple named libraries (CardGen + external folders like SillyTavern/Backup) 
  - Copy / Move between repositories
  - Delete in-place (if repo is writable)
-  **Library UX**: search + sort + debounced search
-  **Settings UX**: numeric inputs fixed (Max Tokens / Request Timeout no longer fight while typing) 
- **Language selection** for field generation (generate character fields in your chosen language)

---

## Features

### Character creation
- Generate SillyTavern character fields from a free-text idea prompt
- Optional name + POV selection
- Fill missing fields after import (generate only what's empty)
- Per-field regeneration (regenerate only what you want)
- **Field Detail presets** (Short/Detailed/Verbose) + optional per-field overrides
- Language selection for generation (optional)

### Image generation
- Generate an avatar image from an image prompt (or create one from fields)
- Multiple image providers (local + hosted)
- **ComfyUI progress + cancel**
- View avatar full-size in an overlay

### Import / Export
- Export **character JSON**
- Export **PNG character card** with embedded metadata (SillyTavern-style)
- Export avatar PNG
- Import JSON or PNG cards back into the workspace

### Library (multi-repository)
- Add multiple **Library Repositories** (CardGen-managed + external folders)
- Browse cards with thumbnails
- **Search + sort** (debounced search)
- **Copy / Move** cards between repositories
- Delete with confirmation (writable repos)

---

## Screenshots

### Character Workspace
![Character Workspace](docs/images/screenshot-workspace.png)

### Settings

**Text Completion**
![Text Completion Settings](docs/images/screenshot-settings-text.png)

**Image Provider**
![Image Provider Settings](docs/images/screenshot-settings-image.png)

### Library
![Library](docs/images/screenshot-library.png)

---

## Provider support

### Text Completion providers
- **KoboldCPP** (local)
- **OpenAI-compatible** (LM Studio / vLLM / OpenRouter-style endpoints)
- **Google Gemini** (OpenAI-compatible endpoint via Gemini API)

### Image providers
- **ComfyUI** (local workflows)
- **Stable Diffusion API (SDAPI)** (Automatic1111-style endpoints)
- **KoboldCPP** (if enabled for images)
- **Stability AI**
- **Hugging Face Inference Providers**
- **Google**:
  - **Imagen**
  - **Nano Banana** (Gemini image models)

---

## Library repositories: managed vs folder

In **Settings ' Library**, each repository points to a folder on disk:

- **Managed**
  - CardGen 'owns' the library metadata (fast browsing and extensible features)
  - May maintain an `index.json` for performance/metadata
  - Best for: **CardGen Library**, curated collections, backups you want CardGen to manage

- **Folder (external)**
  - CardGen treats it as an external folder and **does not** rely on library metadata
  - Cards are discovered by scanning files
  - Best for: **SillyTavern Characters folder**, shared/export folders, Kindroid backups

You can **Copy/Move** cards between repositories to curate your libraries.

---

## Security & API keys

API keys are stored securely using **keytar** when available (OS credential vault):

- Windows: Credential Manager  
- macOS: Keychain  
- Linux: Secret Service (may require additional setup depending on distro)

If keychain access is unavailable (common on Linux/WSL), keys fall back to `server/data/config.local.json` (ignored by git).  
At runtime, environment variables take precedence over stored keys:

- `OPENAI_API_KEY`
- `GOOGLE_API_KEY`
- `STABILITY_API_KEY`
- `HUGGINGFACE_API_KEY`

The config stores only a **key reference name** (e.g. `apiKeyRef: "my-hf-key"`) unless keytar is unavailable.

---

## Requirements

- **Node.js 20.19+ or 22.12+** (Vite 7 requirement)
- Internet access for hosted providers (Stability/HF/Google)
- Optional local backends:
  - KoboldCPP (default: `http://127.0.0.1:5001`)
  - ComfyUI (default: `http://127.0.0.1:8188`)
  - SDAPI/Automatic1111 (default: `http://127.0.0.1:7860`)

> Note: `keytar` may require build tools on some systems if a prebuilt binary isn't available.

---

## Installation

Clone the repo:

```bash
git clone https://github.com/ewizza/ST-CardGen.git
cd ST-CardGen
```

## Quick start (development)

From the repo root:

```bash
npm install
npm run dev
```
---

## Troubleshooting (common issues)

### `tsx` or `vite` is not recognized
This almost always means dependencies weren’t installed at the repo root.

From the repo root:

```bash
npm install
npm run dev
```
### Ports already in use (Vite 5173 / Server 3001) ###

If Vite prints something like “Port 5173 is in use, trying another one…”, that’s fine — it will choose the next available port and print the final URL (e.g. http://localhost:5176/).

If the server fails with EADDRINUSE :::3001, something else is already using port 3001. Either stop the other process or free the port:

Windows (PowerShell):
```ps
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```
Then start again:
```bash
npm run dev
```
### “This operation was aborted” / connection aborted during long generations ###

Increase these settings in Settings → Text Completion:

Max Tokens

Request timeout

Verbose presets and longer fields will require higher values depending on your provider/model.
