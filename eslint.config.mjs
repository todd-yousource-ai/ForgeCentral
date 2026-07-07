// ForgeCentral (Console) ESLint flat config. Enforces the TypeScript_Dev_Rules.md Section 13 lints.
// Packages inherit this root config; a package may narrow (never loosen) it. The plugins resolve once
// the workspace devDependencies are installed (the first implementation PR); this file is the discipline
// contract until then.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/build/**', '**/coverage/**', '**/node_modules/**'],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'no-console': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='eval']",
          message: 'eval is banned (TypeScript_Dev_Rules.md Section 9.3).',
        },
      ],
    },
  },
);
