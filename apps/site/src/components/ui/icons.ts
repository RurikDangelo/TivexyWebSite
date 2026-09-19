/**
 * Conjunto de ícones da Tivexy: grade 24×24, traço 1.5, pontas arredondadas.
 * Cada entrada é o conteúdo interno do <svg>. Formas preenchidas usam a classe "fill".
 */
export const icons = {
  'arrow-right': '<path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5"/>',
  'arrow-up-right': '<path d="M7.5 16.5 16.5 7.5M9 7.5h7.5V15"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  menu: '<path d="M4 8.5h16M4 15.5h16"/>',
  close: '<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  'chevron-down': '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>',
  mail: '<rect x="3.25" y="5.25" width="17.5" height="13.5" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
  whatsapp:
    '<path d="M4.3 19.7 5.4 16a8 8 0 1 1 3 2.9l-4.1.8Z"/><path class="fill" d="M9.1 8.2c.2-.4.5-.5.8-.5h.5c.2 0 .4.1.5.4l.7 1.6c.1.2 0 .5-.1.6l-.5.6c-.1.1-.2.3 0 .5a6.3 6.3 0 0 0 2.6 2.4c.2.1.4.1.5 0l.6-.7c.2-.2.4-.2.6-.1l1.6.8c.2.1.3.3.3.5v.5c0 .3-.2.7-.5.9-.6.4-1.5.5-2.4.2a8.6 8.6 0 0 1-4.9-4.6c-.3-.9-.3-1.9.1-2.5Z"/>',
  alert: '<circle cx="12" cy="12" r="8.75"/><path d="M12 7.75v5M12 16.25h.01"/>',
  shield:
    '<path d="M12 3.25 19 6v5.25c0 4.6-3 8.1-7 9.5-4-1.4-7-4.9-7-9.5V6l7-2.75Z"/><path d="m9 12 2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="8.75"/><path d="M12 7.5V12l3 2"/>',
  search: '<circle cx="11" cy="11" r="6.25"/><path d="m20 20-4.5-4.5"/>',
  bell: '<path d="M6.25 16.5V11a5.75 5.75 0 0 1 11.5 0v5.5l1.5 1.75H4.75l1.5-1.75Z"/><path d="M10 20.75a2.1 2.1 0 0 0 4 0"/>',

  /* Problemas (estado "hoje") */
  sheet:
    '<rect x="3.75" y="3.75" width="16.5" height="16.5" rx="2.25"/><path d="M3.75 9.25h16.5M3.75 14.75h16.5M9.25 3.75v16.5"/>',
  pen: '<path d="m4.5 19.5 1-4.25L15.75 5a2.12 2.12 0 0 1 3 3L8.5 18.25l-4 1.25Z"/><path d="m13.75 7 3.25 3.25"/>',
  unlink:
    '<rect x="2.75" y="8.75" width="6.5" height="6.5" rx="1.75"/><rect x="14.75" y="8.75" width="6.5" height="6.5" rx="1.75"/><path d="M9.25 12h1.25M13.5 12h1.25M11 15.5l2-7"/>',
  'eye-off':
    '<path d="m3.5 3.5 17 17"/><path d="M10.6 5.15A9.4 9.4 0 0 1 12 5c4.9 0 8.2 4.4 9.2 7a12.6 12.6 0 0 1-2.4 3.5M6.7 6.7C4.8 8 3.5 9.9 2.8 12c1 2.6 4.3 7 9.2 7 1.8 0 3.4-.6 4.8-1.4"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  repeat:
    '<path d="m16.5 3 3 3-3 3"/><path d="M4.5 11.25V10a4 4 0 0 1 4-4h11"/><path d="m7.5 21-3-3 3-3"/><path d="M19.5 12.75V14a4 4 0 0 1-4 4h-11"/>',
  scatter:
    '<rect x="3.25" y="3.75" width="6" height="6" rx="1.5"/><rect x="14.5" y="2.75" width="6.25" height="6.25" rx="1.5"/><rect x="8.75" y="14.25" width="6" height="6" rx="1.5"/><circle cx="19" cy="16.5" r="1.75"/><circle cx="4.5" cy="17.5" r="1.25"/>',
  legacy:
    '<rect x="3.25" y="4.25" width="17.5" height="12" rx="2"/><path d="M8.5 20h7M12 16.25V20"/><path d="M12 7.5v2.75l1.75 1.25"/>',

  /* Soluções */
  blueprint:
    '<rect x="3.25" y="4.25" width="17.5" height="15.5" rx="2.25"/><path d="M3.25 9h17.5M9 9v10.75M12.5 12.75h5M12.5 16h3"/>',
  layers:
    '<path d="m12 3.5 8.5 4.25L12 12 3.5 7.75 12 3.5Z"/><path d="m3.5 12 8.5 4.25L20.5 12"/><path d="m3.5 16.25 8.5 4.25 8.5-4.25"/>',
  flow: '<circle cx="6" cy="6" r="2.5"/><rect x="15.5" y="15.5" width="5" height="5" rx="1.25"/><path d="M6 8.5v4.25A2.75 2.75 0 0 0 8.75 15.5h6.75"/><path d="m12.75 13 2.75 2.5-2.75 2.5"/>',
  spark:
    '<path d="M11 3.5 12.9 9l5.6 1.9-5.6 1.9L11 18.5 9.1 12.8 3.5 10.9 9.1 9 11 3.5Z"/><path d="m18.5 15.5.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z"/>',

  /* Painel (hero) */
  grid: '<rect x="3.75" y="3.75" width="7" height="7" rx="1.75"/><rect x="13.25" y="3.75" width="7" height="7" rx="1.75"/><rect x="3.75" y="13.25" width="7" height="7" rx="1.75"/><rect x="13.25" y="13.25" width="7" height="7" rx="1.75"/>',
  cart: '<path d="M3.5 4.5h2.25l2.1 10.25h10.4l1.9-7.5H6.6"/><circle cx="9" cy="19" r="1.25"/><circle cx="17" cy="19" r="1.25"/>',
  users:
    '<circle cx="9" cy="8.5" r="3.25"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><path d="M15.5 5.6a3.25 3.25 0 0 1 0 5.8M17.5 14.3a5.5 5.5 0 0 1 3 5.2"/>',
  box: '<path d="m12 3.25 8 4.25v9L12 20.75 4 16.5v-9l8-4.25Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v8.75"/>',
  wallet:
    '<rect x="3.25" y="5.75" width="17.5" height="13.5" rx="2.25"/><path d="M3.25 9.75h17.5M15.5 14.5h1.5"/>',
  chart: '<path d="M4 20h16"/><path d="M7 16.5v-5M12 16.5V6.5M17 16.5v-8"/>',
  chat: '<path d="M4.25 18.75V7.5A2.25 2.25 0 0 1 6.5 5.25h11a2.25 2.25 0 0 1 2.25 2.25v6.5a2.25 2.25 0 0 1-2.25 2.25H8.5l-4.25 2.75Z"/>',
  file: '<path d="M13.75 3.25H7.5A2.25 2.25 0 0 0 5.25 5.5v13A2.25 2.25 0 0 0 7.5 20.75h9a2.25 2.25 0 0 0 2.25-2.25V8.25l-5-5Z"/><path d="M13.5 3.5V8.5h5M8.75 13h6.5M8.75 16.5h4"/>',

  /* Sistemas (cases e projetos) */
  coffee:
    '<path d="M4.5 9.5h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5v-5Z"/><path d="M15.5 11h1.25a2.75 2.75 0 0 1 0 5.5H15"/><path d="M8.25 3.25c-.8.8.8 1.45 0 2.25M11.75 3.25c-.8.8.8 1.45 0 2.25"/>',
} as const;

export type IconName = keyof typeof icons;
