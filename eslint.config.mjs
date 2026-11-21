import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const SCRIPTS_IMPORT_PATTERN = {
  group: ["../scripts/*", "../../scripts/*", "../../../scripts/*", "../../../../scripts/*"],
  message: "Do not import from scripts/ inside src/; move reusable helpers into src/lib/ so scripts/ stays decoupled from the web build.",
};

const WORKER_AND_SHARED_DOMAIN_FILES = [
  "worker/maya-voice/src/**/*.{ts,tsx,mts}",
  "scripts/workbook-worker.ts",
  "scripts/retention-worker.ts",
  "src/ds/**/*.{ts,tsx}",
  "src/lib/supabase-admin.ts",
  "src/lib/family-retention-node.ts",
  "src/lib/family-deletion-client.ts",
  "src/lib/family-deletion-store.ts",
  "src/lib/retention-stripe.ts",
  "src/lib/card-reconcile-server.ts",
  "src/lib/maya/**/*.{ts,tsx}",
  "src/lib/maya-*.ts",
  "src/lib/maya.ts",
  "src/lib/board/**/*.{ts,tsx}",
  "src/lib/board-*.ts",
  "src/lib/board.ts",
  "src/lib/workbook-curriculum/**/*.{ts,tsx}",
  "src/lib/workbook-worker.ts",
  "src/lib/workbook-ai.ts",
  "src/lib/workbook-job*.ts",
  "src/lib/workbook-plan*.ts",
  "src/lib/workbook-render*.ts",
  "src/lib/workbook-generator*.ts",
  "src/lib/workbook-template*.ts",
  "src/lib/assessment/**/*.{ts,tsx}",
  "src/lib/question-package*.ts",
  "src/lib/learning-events*.ts",
  "src/lib/database*.ts",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Keep src/ decoupled from standalone scripts/ so Vercel can skip script-only changes.
  {
    files: ["src/**/*.{ts,tsx,mts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [SCRIPTS_IMPORT_PATTERN],
        },
      ],
    },
  },
  // Keep runtime-agnostic domain, design-system, and worker modules free of Next.js and @sentry/nextjs.
  {
    files: WORKER_AND_SHARED_DOMAIN_FILES,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@sentry/nextjs",
              message: "Shared domain, design-system, and worker modules must not import @sentry/nextjs; use @sentry/node or runtime-agnostic monitoring helpers.",
            },
          ],
          patterns: [
            {
              group: ["next", "next/*"],
              message: "Shared domain, design-system, and worker modules must not import Next.js runtime APIs (keep Next.js coupling in src/app or *-server.ts adapters).",
            },
            SCRIPTS_IMPORT_PATTERN,
          ],
        },
      ],
    },
  },
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
