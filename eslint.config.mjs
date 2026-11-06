import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The SDK and exporters stay behind telemetry.ts, which only instrumentation.ts loads, so they cannot reach the
// browser bundle (scripts/check-client-bundle.sh checks the build). Request code uses @opentelemetry/api via span.ts.
const otelSdk = {
  group: ["@opentelemetry/*", "!@opentelemetry/api"],
  message: "Only src/lib/ops/telemetry.ts (and the test helper) import the OpenTelemetry SDK and exporters.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-console": "error",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/ops/telemetry.ts", "src/lib/ops/memory-telemetry.ts", "src/**/*.test.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: [otelSdk] }] },
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
          patterns: [otelSdk],
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
          patterns: [otelSdk],
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
          patterns: [otelSdk],
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
  globalIgnores(["vendor/braces/**"]),
]);

export default eslintConfig;
