# Submission

## Assumptions

List any important assumptions.

- Configured `relationMode = "prisma"` in the Prisma schema to maintain compatibility with SQLite without foreign key restrictions.
- Added `cross-env` to the `db:reset` script to ensure smooth cross-platform execution on Windows environments.

## AI usage

Which tools?

- GitHub Copilot & Gemini

## Verification

One AI-assisted part verified carefully.

I carefully verified the form state logic for AI extraction (/inbox/:messageId). Specifically, I manually tested that repeatedly clicking "Extract with AI" only populates empty/untouched input fields (product, quantity, material, budget) and strictly preserves any values that were previously entered or modified by the user. Additionally, I ran the Vitest suite (npm test) to confirm that all 6 API integration tests pass with the updated Zod schemas and Prisma relation models.
