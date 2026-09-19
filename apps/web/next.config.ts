import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /*
   * @tivexy/core é publicado como TypeScript (sem build próprio): o package
   * expõe `src/index.ts` direto. Sem isto, o Next recebe .ts de node_modules
   * e não transpila.
   */
  transpilePackages: ['@tivexy/core'],
};

export default nextConfig;
