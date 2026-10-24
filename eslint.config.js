import tseslint from 'typescript-eslint';

const tsFiles = ['**/*.{ts,tsx,mts,cts}'];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.superpowers/**', '**/coverage/**'] },
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: tsFiles })),
  { files: tsFiles, rules: { '@typescript-eslint/no-explicit-any': 'off' } },
);
