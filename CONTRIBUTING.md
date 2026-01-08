# Contributing to WAAAH

We welcome contributions! Please follow these guidelines to ensure smooth collaboration.

## 🔧 Development Setup

1.  **Package Manager**: We use `pnpm` exclusively.
    ```bash
    npm install -g pnpm
    ```
2.  **Install dependencies**:
    ```bash
    pnpm install
    ```
3.  **Build**:
    ```bash
    pnpm -r build
    ```

## 📂 Project Structure

- `packages/` contains all workspaces.
- `config/` holds system-wide configuration (agent roles, prompts).

## 📝 Code Style

- Use **TypeScript** for all logic.
- Follow the existing linting rules (standard TS config).
- Ensure strictly typed interfaces in `@opensourcewtf/waaah-types`.

## 🧪 Testing

- Run individual package tests using `pnpm test` (if applicable).
- Manually verify MCP tool changes using `curl` against the localized server before committing.

## 🚀 Committing

- Use conventional commits (e.g., `feat: add assignment tool`, `fix: queue timeout logic`).
