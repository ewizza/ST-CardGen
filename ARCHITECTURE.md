# ST-CardGen Architecture

## Overview

ST-CardGen is a monorepo containing a Vue 3 frontend and Node.js backend.

## Project Structure

```
ST-CardGen/
├── frontend/              # Vue 3 + Vite + TypeScript
│   ├── src/
│   │   ├── components/    # Vue components
│   │   ├── composables/   # Reusable composition functions
│   │   ├── pages/         # Route pages
│   │   ├── services/      # API service layer
│   │   ├── stores/        # Pinia stores
│   │   ├── types/         # TypeScript type definitions
│   │   └── utils/         # Utility functions
│   └── public/            # Static assets
├── server/                # Node + Express + TypeScript
│   ├── src/
│   │   ├── adapters/      # External service adapters
│   │   ├── config/        # Configuration management
│   │   ├── domain/        # Business logic
│   │   ├── providers/     # AI provider implementations
│   │   ├── routes/        # API routes
│   │   ├── services/      # Service layer
│   │   └── utils/         # Utility functions
│   └── data/              # Runtime data
└── docs/                  # Documentation
```

## Data Flow

### Character Generation

1. User inputs idea in frontend
2. Frontend sends request to `/api/character/generate`
3. Backend builds prompt using domain logic
4. Backend calls LLM provider (KoboldCPP, OpenAI-compatible, etc.)
5. Backend parses LLM response
6. Backend returns structured character data
7. Frontend stores in Pinia store and localStorage

### Image Generation

1. User requests image generation
2. Frontend sends request to `/api/image/generate`
3. Backend creates job and returns job ID
4. Frontend polls `/api/image/jobs/:id`
5. Backend calls image provider (ComfyUI, Stability AI, etc.)
6. Backend updates job status
7. Frontend receives completed image URL

## State Management

### Frontend (Pinia)

- **characterStore**: Current character data
- **workspaceStore**: Generation parameters
- **configStore**: App configuration
- **generateStore**: Generation state
- **regenerateStore**: Regeneration controls

### Backend

- **Config Store**: Persisted configuration
- **Secret Store**: API keys (keytar + fallback)
- **Image Jobs**: In-memory job tracking

## API Design

All API responses follow this format:

**Success:**
```json
{
  "ok": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": { ... }
  }
}
```

## Security

- API keys stored in OS keychain (keytar)
- Fallback to gitignored config file
- Environment variables override all
- Input validation with Zod
- CORS restricted in production

## Performance

- Local storage for persistence
- Job cleanup every 10 minutes
- Debounced search in library
- Code splitting in production

## Testing Strategy

- **Unit tests**: Individual functions
- **Integration tests**: API routes
- **Component tests**: Vue components
- **E2E tests**: Critical user flows (future)

## Deployment

### Development
```bash
npm run dev
```

### Production (Docker)
```bash
docker-compose up -d
```

### Production (Manual)
```bash
npm run build
$env:NODE_ENV="production"
npm start
```
