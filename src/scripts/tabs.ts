// Abas acessíveis (padrão WAI-ARIA "Tabs") para contêineres com [data-tabs].
// Clique ativa a aba; setas, Home e End movem o foco e ativam. O painel inativo recebe
// [data-inactive], e o CSS de quem usa decide como escondê-lo.
document.querySelectorAll<HTMLElement>('[data-tabs]').forEach((root) => {
  if (root.dataset.tabsReady) return;
  root.dataset.tabsReady = 'true';

  const tabs = Array.from(root.querySelectorAll<HTMLElement>('[role="tab"]'));
  const panels = tabs.map((tab) =>
    document.getElementById(tab.getAttribute('aria-controls') ?? ''),
  );

  const select = (index: number) => {
    tabs.forEach((tab, i) => {
      const selected = i === index;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[i]?.toggleAttribute('data-inactive', !selected);
    });
  };

  root.addEventListener('click', (event) => {
    const tab = (event.target as Element | null)?.closest<HTMLElement>('[role="tab"]');
    const index = tab ? tabs.indexOf(tab) : -1;
    if (index >= 0) select(index);
  });

  root.addEventListener('keydown', (event) => {
    const current = tabs.indexOf(event.target as HTMLElement);
    if (current === -1) return;

    const last = tabs.length - 1;
    const targets: Record<string, number> = {
      ArrowRight: current === last ? 0 : current + 1,
      ArrowLeft: current === 0 ? last : current - 1,
      Home: 0,
      End: last,
    };
    const next = targets[event.key];
    if (next === undefined) return;

    event.preventDefault();
    select(next);
    tabs[next].focus();
  });
});
