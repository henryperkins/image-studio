import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default [
  eslint.configs.recommended,
  {
    ignores: ['dist/**', 'node_modules/**', '.vite/**', 'vite.config.ts.timestamp-*', 'src/__tests__/**']
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parser: tsparser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        },
        // Ensure TypeScript parser resolves tsconfig relative to this config file (web/)
        tsconfigRootDir: path.dirname(fileURLToPath(import.meta.url)),
        project: './tsconfig.json'
      },
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        history: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
        HTMLElement: 'readonly',
        HTMLImageElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        HTMLVideoElement: 'readonly',
        MouseEvent: 'readonly',
        KeyboardEvent: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        React: 'readonly',
        NodeJS: 'readonly',
        // Node globals for config files
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        global: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react': react,
      'react-hooks': reactHooks
    },
    settings: {
      react: {
        version: 'detect'
      }
    },
    rules: {
      ...tseslint.configs['recommended'].rules,
      ...react.configs['recommended'].rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs['recommended'].rules,
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/ban-ts-comment': ['error', {
        'ts-expect-error': 'allow-with-description',
        'ts-ignore': false,
        'ts-nocheck': false,
        'ts-check': false
      }],
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'semi': ['error', 'always'],
      'quotes': ['error', 'single', { avoidEscape: true }],
      'comma-dangle': ['error', 'never'],
      'object-curly-spacing': ['error', 'always'],
      'jsx-quotes': ['error', 'prefer-double'],
      'no-useless-escape': 'warn'
    }
  },
  {
    // JavaScript and config files
    files: ['**/*.{js,jsx,mjs}', 'eslint.config.js', 'vite.config.ts'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        URL: 'readonly'
      }
    },
    rules: {
      'semi': ['error', 'always'],
      'quotes': ['error', 'single', { avoidEscape: true }],
      'comma-dangle': ['error', 'never'],
      'object-curly-spacing': ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-useless-escape': 'warn'
    }
  }
];