import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-console": "error",
    },
  },
  {
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    ignores: [
      "src/components/sites/console/key-pair-create.tsx",
      "src/app/actions/resources.ts",
      "src/app/actions/auth.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/key-pair",
              importNames: ["commitAttempt", "finishCreate"],
              message: "Only key-pair-create.tsx calls commitAttempt and finishCreate.",
            },
            {
              name: "@/app/actions/resources",
              importNames: ["createKeyPairAction"],
              message: "Only key-pair-create.tsx calls createKeyPairAction.",
            },
            {
              name: "@/lib/vws-api/client",
              importNames: ["createKeyPair"],
              message: "Pages call createKeyPairAction.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/components/sites/console/key-pair-create.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/vws-api/client",
              importNames: ["createKeyPair"],
              message: "Pages call createKeyPairAction.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/app/actions/resources.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/key-pair",
              importNames: ["commitAttempt", "finishCreate"],
              message: "Only key-pair-create.tsx calls commitAttempt and finishCreate.",
            },
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
  ]),
]);

export default eslintConfig;
