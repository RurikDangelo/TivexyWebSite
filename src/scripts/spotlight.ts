import { media } from '@/config/breakpoints';

// Luz sutil que segue o cursor nos cartões com [data-spotlight]. Só com mouse e sem reduced motion.
const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const reduced = window.matchMedia(media.reducedMotion).matches;

if (canHover && !reduced) {
  document.querySelectorAll<HTMLElement>('[data-spotlight]').forEach((card) => {
    if (card.dataset.spotlightReady) return;
    card.dataset.spotlightReady = 'true';
    card.addEventListener('pointermove', (event) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
      card.style.setProperty('--my', `${event.clientY - rect.top}px`);
    });
  });
}
