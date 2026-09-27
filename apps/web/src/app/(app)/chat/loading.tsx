import { EsqueletoDaConversa } from './skeleton';

/**
 * O carregamento de `/chat`.
 *
 * Renderiza dentro do `<section>` do layout — a coluna de canais ao lado já
 * está na tela e não pisca. É o esqueleto da conversa, e não o da tela de
 * "escolha um canal", porque a forma que ele precisa reservar é a maior das
 * duas: quem chega em `/chat` com um canal na memória do roteador vê a
 * conversa em seguida.
 */
export default function Loading() {
  return <EsqueletoDaConversa />;
}
