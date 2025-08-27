import eslint from '@eslint/js';

export default [
  eslint.configs.recommended,
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'web/**',
      'server/**',
      'shared/**'
    ]
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        console: 'readonly'
      }
    },
    rules: {
      'semi': ['error', 'always'],
      'quotes': ['error', 'single', { avoidEscape: true }],
      'comma-dangle': ['error', 'never'],
      'object-curly-spacing': ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }]
    }
  }
];