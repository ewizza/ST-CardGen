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
- Secure **API key store** (secrets are *not* written to config files)

---

## Recent updates (last 2 days)

-  **Stable Diffusion API (SDAPI)** image provider added (Automatic1111-style endpoints) 
-  **ComfyUI progress + cancel** during image generation (UI shows in-progress state and lets you stop jobs)
-  **Text provider request timeouts** + clearer errors (KoboldCPP / OpenAI-compatible / Gemini)
-  **Character Field Detail presets**: **Short / Detailed / Verbose** + **per-field overrides** for more detailed character fields 
-  **Library repositories**: multiple named libraries (CardGen + external folders like SillyTavern/Backup) 
  - Copy / Move between repositories
  - Delete in-place (if repo is writable)
-  **Library UX**: search + sort + debounced search
-  **Settings UX**: numeric inputs fixed (Max Tokens / Request Timeout no longer fight while typing) 

---

## Features

### Character creation
- Generate SillyTavern character fields from a free-text idea prompt
- Optional name + POV selection
- Fill missing fields after import (generate only what's empty)
- Per-field regeneration (regenerate only what you want)
- **Field Detail presets** (Short/Detailed/Verbose) + optional per-field overrides

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

 **API key values are never stored in `config.json` or any file in this repo.**  
Keys are stored securely using **keytar**, which uses your OS credential vault:

- Windows: Credential Manager  
- macOS: Keychain  
- Linux: Secret Service (may require additional setup depending on distro)

The config only stores a **key reference name** (e.g. `apiKeyRef: "my-hf-key"`), not the secret.

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
