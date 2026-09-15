// Carrega a aparência das telas ilustrativas (system-preview.css) só quando alguma tela chega perto
// da área visível: o arquivo fica fora do carregamento inicial. O CSS crítico de SystemPreview.astro
// já reserva o tamanho das telas, então nada muda de lugar quando ele chega.
// O endereço vem do atributo data-stylesheet, gerado pelo import ?url no próprio componente.
const previews = document.querySelectorAll<HTMLElement>('[data-stylesheet]');
const href = previews[0]?.dataset.stylesheet;

if (href) {
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.append(link);
    },
    { rootMargin: '150% 0px' },
  );

  previews.forEach((preview) => observer.observe(preview));
}

export {};
