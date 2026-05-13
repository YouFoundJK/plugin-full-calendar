import { defineConfig } from 'eslint/config';
import css from '@eslint/css';

export default defineConfig([
  {
    files: ['src/**/*.css'],
    plugins: {
      css
    },
    language: 'css/css',
    languageOptions: {
      tolerant: true
    },
    extends: ['css/recommended'],
    rules: {
      // Obsidian CSS variables are defined by the host app/theme and are not local declarations.
      'css/no-invalid-properties': 'off',
      'css/no-important': 'warn',
      'css/use-baseline': 'warn'
    }
  }
]);
