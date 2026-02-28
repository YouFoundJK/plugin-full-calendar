import tsparser from "@typescript-eslint/parser";
import globals from "globals";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      "obsidianmd/sample-names": "off",
      "obsidianmd/prefer-file-manager-trash-file": "error",
      "obsidianmd/ui/sentence-case": ["error", { "allowAutoFix": true }]
    }
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
    languageOptions: {
      globals: {
        ...globals.jest
      },
    },
    ignores: ["node_modules/", "build/", "dist/", "coverage/"]
  }
]);
