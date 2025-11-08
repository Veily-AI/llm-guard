# Contributing to @veily/llm-guard

Thanks for your interest in contributing! 🎉

## 🚀 Quick Start

```bash
# 1. Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/llm-guard.git
cd llm-guard

# 2. Install dependencies
npm install

# 3. Create a branch
git checkout -b feature/my-awesome-feature

# 4. Make your changes
# ... edit files ...

# 5. Make sure everything works
npm run build
npm test
npm run lint

# 6. Commit and push
git add .
git commit -m "Add my awesome feature"
git push origin feature/my-awesome-feature

# 7. Open a Pull Request
```

## 📋 Guidelines

### Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add support for custom paths
docs: update README examples
test: add tests for createSession
chore: update dependencies
```

### Code Style

- **TypeScript**: Strict mode enabled
- **Linting**: ESLint + Prettier
- **Formatting**: `npm run format` before commit

```bash
# Check style
npm run lint

# Auto-fix
npm run format
```

### Tests

- **Minimum coverage**: 70%
- **TDD preferred**: Write tests first
- **Naming**: Descriptive and in English

```typescript
describe("wrap() - One-liner API", () => {
  it("should process prompt without PII correctly", async () => {
    // ...
  });
});
```

### Documentation

- **README**: For end users
- **docs/**: For technical details
- **JSDoc**: On public functions

```typescript
/**
 * Anonymize: anonymizes a prompt and returns safePrompt + restore() function
 *
 * @param prompt - The original prompt with potential PII
 * @param cfg - Core service configuration
 * @returns Object with safePrompt and async restore function
 */
export async function anonymize(prompt: string, cfg: GuardConfig): Promise<AnonymizeResult>;
```

## 🐛 Report Bugs

Open an [Issue](https://github.com/veily/llm-guard/issues) with:

1. **Description**: What you expected vs what you got
2. **Reproduction**: Steps to reproduce
3. **Environment**: Node version, OS, etc.
4. **Code**: Minimal snippet that reproduces the bug

## ✨ Propose Features

Open an [Issue](https://github.com/veily/llm-guard/issues) with:

1. **Problem**: What problem does it solve
2. **Solution**: How would you solve it
3. **Alternatives**: Other options considered
4. **Impact**: Breaking changes, performance, etc.

## 📄 License

By contributing, you agree that your code will be licensed under MIT.
