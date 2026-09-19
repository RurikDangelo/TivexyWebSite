import { media } from '@/config/breakpoints';

function initScrolledState(header: HTMLElement) {
  const sentinel = document.createElement('div');
  sentinel.setAttribute('aria-hidden', 'true');
  sentinel.style.cssText =
    'position:absolute;top:0;left:0;width:1px;height:8px;pointer-events:none;visibility:hidden;';
  document.body.prepend(sentinel);

  new IntersectionObserver(([entry]) => {
    header.toggleAttribute('data-scrolled', !entry.isIntersecting);
  }).observe(sentinel);
}

function initActiveSection() {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-nav-link]'));
  const ids = [...new Set(links.map((link) => link.dataset.navLink!))];
  const sections = ids
    .map((id) => document.getElementById(id))
    .filter((section): section is HTMLElement => section !== null);

  if (sections.length === 0) return;

  const visible = new Set<string>();

  const sync = () => {
    // A seção ativa é a última (na ordem do documento) que cruza a faixa central da tela.
    const current = sections.filter((section) => visible.has(section.id)).at(-1)?.id;
    for (const link of links) {
      if (link.dataset.navLink === current) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      }
      sync();
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );

  sections.forEach((section) => observer.observe(section));
}

function initMobileMenu() {
  const dialog = document.querySelector<HTMLDialogElement>('[data-menu]');
  const openButton = document.querySelector<HTMLButtonElement>('[data-menu-open]');
  if (!dialog || !openButton) return;

  const close = () => {
    if (dialog.open) dialog.close();
  };

  openButton.addEventListener('click', () => {
    dialog.showModal();
    openButton.setAttribute('aria-expanded', 'true');
  });

  dialog.addEventListener('close', () => {
    openButton.setAttribute('aria-expanded', 'false');
  });

  dialog.querySelector('[data-menu-close]')?.addEventListener('click', close);
  dialog.querySelectorAll('[data-menu-link]').forEach((link) => {
    link.addEventListener('click', close);
  });

  window.matchMedia(media.lg).addEventListener('change', (event) => {
    if (event.matches) close();
  });
}

const header = document.querySelector<HTMLElement>('[data-header]');

if (header && !header.dataset.ready) {
  header.dataset.ready = 'true';
  initScrolledState(header);
  initActiveSection();
  initMobileMenu();
}
