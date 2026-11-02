import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['apps/web/dist/**', 'node_modules/**', 'private-data/**', 'test-results/**', 'playwright-report/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['apps/**/*.ts', 'packages/**/*.ts', 'scripts/**/*.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
