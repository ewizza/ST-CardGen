# Contributing to ST-CardGen

Thank you for your interest in contributing to ST-CardGen!

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/ST-CardGen.git
   cd ST-CardGen
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy environment files:
   ```bash
   cp .env.example .env
   cp frontend\.env.example frontend\.env
   cp server\.env.example server\.env
   ```

4. Start development server:
   ```bash
   npm run dev
   ```

## Testing

Run tests with:
```bash
npm test              # All tests
npm run test:frontend # Frontend only
npm run test:server   # Server only
npm run test:coverage # With coverage
```

## Code Style

- Use TypeScript for all new code
- Follow existing code structure
- Add JSDoc comments for public functions
- Write tests for new features
- Run type checking before committing

## Pull Request Process

1. Create a feature branch from `develop`
2. Make your changes
3. Add/update tests
4. Ensure all tests pass
5. Update documentation
6. Submit PR to `develop` branch

## Architecture Guidelines

- **Frontend**: Use Composition API with `<script setup>`
- **State**: Use Pinia stores for global state
- **Styling**: Use Tailwind CSS or scoped CSS
- **API**: Use Zod schemas for validation
- **Types**: Export types from dedicated files

## Questions?

Open an issue for discussion before major changes.
