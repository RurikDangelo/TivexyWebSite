/** Espelho de src/styles/media.css para uso em JavaScript. Mantenha os dois em sincronia. */
export const media = {
  sm: '(width >= 40em)',
  md: '(width >= 48em)',
  lg: '(width >= 64em)',
  xl: '(width >= 80em)',
  reducedMotion: '(prefers-reduced-motion: reduce)',
} as const;
