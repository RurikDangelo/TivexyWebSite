import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
  {
    rules: {
      /*
       * O prefixo `_` já é a convenção deste repositório para argumento que
       * existe por causa da assinatura e não é lido — `_anterior` de toda
       * Server Action de formulário, por exemplo.
       *
       * A regra padrão só reclama do **último** argumento não usado, então a
       * convenção funcionava por acidente: em `criarLead(_anterior, form)` o
       * `form` é lido e o `_anterior` passa batido. Numa ação que não lê
       * nenhum dos dois — `aceitarConvite`, onde o tenant vem da sessão e não
       * do formulário — os dois viram aviso.
       *
       * Honrar o `_` explicitamente é dizer a mesma coisa de propósito, em vez
       * de depender da ordem dos argumentos.
       */
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
]);

export default eslintConfig;
