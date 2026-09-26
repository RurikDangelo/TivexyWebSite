import { EsqueletoDaConversa } from '../skeleton';

/**
 * O carregamento de um canal.
 *
 * Mesmo esqueleto de `/chat`, de propósito: trocar de canal não pode mudar a
 * forma da tela entre o clique e a resposta. Era esse o salto — cada rota com
 * o seu próprio desenho de espera — que o DESIGN_SYSTEM manda eliminar.
 */
export default function Loading() {
  return <EsqueletoDaConversa />;
}
