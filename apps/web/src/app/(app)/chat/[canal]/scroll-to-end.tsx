'use client';

import { useEffect, useRef } from 'react';

/**
 * Abre a conversa no fim, que é onde ela está acontecendo.
 *
 * Sem isto, um canal com oitenta mensagens abre na primeira — a de dois meses
 * atrás —, e a pessoa precisa rolar até o fim toda vez. É o tipo de detalhe
 * que não aparece numa lista de requisitos e define se a tela é usável.
 *
 * ## Por que não o truque do `flex-col-reverse`
 *
 * Ele resolve isto em CSS puro, sem JavaScript, e por isso é tentador. Mas
 * exige inverter a ordem dos elementos no DOM, e aí a ordem de leitura do
 * leitor de tela, a ordem do Tab e a ordem em que a região `aria-live`
 * anuncia passam todas a ser de trás para a frente. Rolagem é conforto;
 * ordem de leitura é acesso.
 *
 * ## Por que `scrollTop`, e não `scrollIntoView`
 *
 * `scrollIntoView` sobe pelo ancestral rolável mais próximo — que numa janela
 * baixa pode ser a página inteira, e aí ele rola o documento e some com o
 * cabeçalho. Aqui o alvo é um contêiner nomeado: `[data-rolagem-da-conversa]`.
 */

export interface AoFimDaConversaProps {
  /**
   * Id da última mensagem. Muda quando chega mensagem nova (ou quando se troca
   * de canal), e é isso que reposiciona a rolagem — não uma nova montagem.
   */
  ultimaMensagem: string | null;
}

export function AoFimDaConversa({ ultimaMensagem }: AoFimDaConversaProps) {
  const marca = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const caixa = marca.current?.closest('[data-rolagem-da-conversa]');
    if (!(caixa instanceof HTMLElement)) return;

    /*
     * Só desce sozinho quem já estava por perto do fim. Quem subiu para reler
     * uma combinação de ontem não pode ser puxado para baixo porque alguém
     * escreveu — é a forma mais rápida de tornar a rolagem inútil.
     *
     * Na primeira pintura `ultimaMensagem` acabou de virar de `null`/outro
     * canal e a caixa está no topo, com `scrollTop` zero: a distância até o
     * fim é a altura inteira. Daí a exceção explícita.
     */
    const distanciaDoFim = caixa.scrollHeight - caixa.scrollTop - caixa.clientHeight;
    const primeiraPintura = caixa.scrollTop === 0;

    if (primeiraPintura || distanciaDoFim < 200) {
      caixa.scrollTop = caixa.scrollHeight;
    }
  }, [ultimaMensagem]);

  return <div ref={marca} aria-hidden />;
}
