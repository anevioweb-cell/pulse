import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import boundaries from 'eslint-plugin-boundaries';
import { flatConfigs as importX } from 'eslint-plugin-import-x';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import security from 'eslint-plugin-security';
import globals from 'globals';
import { configs as tseslint } from 'typescript-eslint';

const TS_FILES = ['**/*.{ts,tsx}'];
const TEST_FILES = ['**/*.test.{ts,tsx}', 'src/test/**'];

export default defineConfig(
  globalIgnores(['dist', 'coverage', 'storybook-static', 'node_modules']),

  js.configs.recommended,
  tseslint.strictTypeChecked,
  tseslint.stylisticTypeChecked,
  importX.recommended,
  importX.typescript,
  security.configs.recommended,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({ project: './tsconfig.app.json' }),
      ],
    },
    rules: {
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'type'],
          pathGroups: [{ pattern: '@/**', group: 'internal' }],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/no-default-export': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },

  // Application source: React, a11y, and project code rules from CLAUDE.md.
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      boundaries,
    },
    extends: [reactHooks.configs.flat.recommended, jsxA11y.flatConfigs.recommended],
    settings: {
      'import/resolver': {
        typescript: { project: './tsconfig.app.json' },
      },
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app' },
        { type: 'feature', pattern: 'src/features/*', capture: ['feature'] },
        { type: 'shared', pattern: 'src/shared' },
      ],
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML is banned (see CLAUDE.md).',
        },
        {
          selector: "JSXAttribute[name.name='style']",
          message:
            'Inline styles are banned; use Tailwind classes and design tokens (see CLAUDE.md).',
        },
      ],
      '@typescript-eslint/no-magic-numbers': [
        'error',
        {
          ignore: [-1, 0, 1],
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
          ignoreEnums: true,
          ignoreNumericLiteralTypes: true,
          ignoreReadonlyClassProperties: true,
          ignoreTypeIndexes: true,
        },
      ],
      // Import boundaries (see CLAUDE.md "Architecture").
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            {
              allow: { to: { module: { origin: ['external', 'core'] } } },
            },
            {
              from: { element: { type: 'app' } },
              allow: [
                { to: { element: { types: ['app', 'shared'] } } },
                { to: { element: { type: 'feature', fileInternalPath: 'index.ts' } } },
              ],
            },
            {
              from: { element: { type: 'feature' } },
              allow: [
                { to: { element: { type: 'shared' } } },
                {
                  to: {
                    element: {
                      type: 'feature',
                      captured: { feature: '{{ from.element.captured.feature }}' },
                    },
                  },
                },
                { to: { element: { type: 'feature', fileInternalPath: 'index.ts' } } },
              ],
            },
            {
              from: { element: { type: 'shared' } },
              allow: { to: { element: { type: 'shared' } } },
            },
          ],
        },
      ],
    },
  },

  {
    files: TEST_FILES,
    rules: {
      '@typescript-eslint/no-magic-numbers': 'off',
    },
  },

  {
    files: ['*.config.{js,ts}'],
    languageOptions: {
      globals: globals.node,
    },
  },

  {
    files: ['**/*.{js,mjs,cjs}'],
    ignores: TS_FILES,
    extends: [tseslint.disableTypeChecked],
  },

  eslintConfigPrettier,
);
