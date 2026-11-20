import path from 'node:path';
import { fileURLToPath } from 'node:url';

import prettier from 'eslint-plugin-prettier';
import { defineConfig } from 'eslint/config';

import { fixupConfigRules } from '@eslint/compat';
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default defineConfig([
  {
    extends: fixupConfigRules(compat.extends('@react-native', 'prettier')),
    plugins: { prettier },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'prettier/prettier': 'error',
    },
  },
  {
    files: ['examples/web/**/*.{ts,tsx}'],
    rules: { 'react-native/no-inline-styles': 'off' },
  },
  {
    ignores: ['**/node_modules/', '**/lib/', '**/dist/', '.yarn/'],
  },
]);
