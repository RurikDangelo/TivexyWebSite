'use client';

import { useEffect } from 'react';

import { marcarCanalComoLido } from '@/lib/chat/actions';

/**
 * "Eu vi este canal" — o que apaga o contador de não lidas na coluna ao lado.
 *
 * É efeito, e não botão, porque ninguém clica em "marcar como lido" depois de
 * ler: o gesto é abrir. Mas ler o que está na tela é o critério, então o
 * marcador só anda quando a conversa **aparece** — este componente é montado
 * dentro dela, e não no cabeçalho da rota.
 *
 * ## Por que esperar
 *
 * Marcar na hora faria a régua "novas mensagens" sumir no mesmo quadro em que
 * apareceu: a ação revalida a rota, a rota volta sem não lidas, e a linha que
 * dizia onde parar de ler evapora antes de a pessoa achá-la. Dois segundos e
 * meio é o tempo de bater o olho e localizar a régua.
 *
 * ## Por que não re-dispara
 *
 * A dependência é o id da mensagem mais nova. Ele não muda com a revalidação
 * que a própria ação provoca, então não há laço: marcar → revalidar →
 * re-renderizar → o efeito vê a mesma mensagem e não faz nada. Quando chega
 * mensagem nova, o id muda e o marcador anda de novo, que é o certo.
 */

const ESPERA_MS = 2500;

export interface MarcarComoLidoProps {
  canalId: string;
  /**
   * Id da mensagem mais nova visível. `null` num canal vazio — aí o marcador
   * ainda assim anda uma vez, para que "nunca abri" deixe de ser verdade.
   */
  ateMensagem: string | null;
}

export function MarcarComoLido({ canalId, ateMensagem }: MarcarComoLidoProps) {
  useEffect(() => {
    const espera = setTimeout(() => {
      /*
       * Aba em segundo plano não conta como leitura: um canal aberto numa aba
       * esquecida zeraria as não lidas de mensagens que ninguém viu.
       */
      if (document.visibilityState !== 'visible') return;
      void marcarCanalComoLido(canalId);
    }, ESPERA_MS);

    return () => clearTimeout(espera);
  }, [canalId, ateMensagem]);

  return null;
}
