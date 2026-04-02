import tsparser from "@typescript-eslint/parser";
import globals from "globals";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["main.js", "build/", "dist/", "node_modules/", "coverage/"] },
  ...obsidianmd.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
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
      "obsidianmd/prefer-file-manager-trash-file": "error",
      "obsidianmd/ui/sentence-case": ["error", { "allowAutoFix": true, "enforceCamelCaseLower": true }],
      "obsidianmd/ui/sentence-case-locale-module": ["error", { "allowAutoFix": true, "enforceCamelCaseLower": true }],
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/no-explicit-any": "error"
    }
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
    languageOptions: {
      globals: {
        ...globals.jest
      },
    }
  }
);
