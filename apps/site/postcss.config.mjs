import postcssGlobalData from '@csstools/postcss-global-data';
import postcssCustomMedia from 'postcss-custom-media';

// Breakpoints vivem em src/styles/media.css como @custom-media.
// O global-data injeta essas definições em cada arquivo/bloco <style>
// para que qualquer componente possa usar @media (--lg) { ... }.
export default {
  plugins: [postcssGlobalData({ files: ['src/styles/media.css'] }), postcssCustomMedia()],
};
