import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".design/**",
    // Other agents' worktrees live in .claude/worktrees; .design-sync/previews has old errors.
    ".claude/**",
    ".design-sync/**",
    // Vendored third-party code, copied unchanged (src/vendor/stageshow/README.md).
    "src/vendor/**",
  ]),
]);

export default eslintConfig;
