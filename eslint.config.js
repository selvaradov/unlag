import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules', '.netlify'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['**/*.ts'], rules: { '@typescript-eslint/no-non-null-assertion': 'off' } },
  // Plain JS files are Node scripts. TypeScript files skip no-undef, so they need no globals here.
  { files: ['**/*.{js,mjs}'], languageOptions: { globals: globals.node } },
);
