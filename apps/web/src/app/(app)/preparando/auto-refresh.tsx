'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Releitura periódica enquanto o preparo acontece — folha cliente, nada mais.
 *
 * Existe porque a tela dizia "Atualize a página em instantes", que é empurrar
 * para o cliente um trabalho do sistema. Quem sabe que a empresa ficou pronta é
 * o servidor, e `router.refresh()` é o que pergunta de novo sem recarregar a
 * aba nem perder a posição de rolagem.
 *
 * Quatro limites, e cada um evita uma mentira ou um desperdício:
 *
 *  - **Só enquanto há o que esperar.** Quem monta este componente é a página, e
 *    só quando o estado ainda pode mudar. Preparo que parou não se atualiza
 *    sozinho, porque atualizar sugeriria que algo ainda caminha.
 *  - **A frase só aparece depois de hidratar.** Sem JavaScript o intervalo nunca
 *    roda; anunciar no HTML do servidor que a página se confere sozinha seria
 *    prometer um comportamento que não vai acontecer.
 *  - **Aba escondida não conta.** Sem isso, vinte abas abertas viram vinte
 *    requisições por intervalo para nada.
 *  - **Desiste.** Depois do teto, para e diz que parou. Um relógio girando por
 *    horas afirma "estamos quase lá" sem base nenhuma.
 */

const INTERVALO_MS = 5000;

/** 10 minutos a 5s. O texto da página já manda falar com alguém depois de meia hora. */
const TENTATIVAS_MAXIMAS = 120;

/*
 * "Já hidratou?" por `useSyncExternalStore`, e não por `setState` num efeito.
 *
 * É o caminho que o React oferece para um valor que difere entre servidor e
 * cliente: o instantâneo do servidor é `false`, o do cliente é `true`, e a
 * troca acontece na hidratação sem render em cascata — que é o que a regra
 * `react-hooks/set-state-in-effect` proíbe. A assinatura nunca notifica nada
 * porque o valor, depois de `true`, não volta a mudar.
 */
const SEM_INSCRICAO = () => () => {};
const NO_CLIENTE = () => true;
const NO_SERVIDOR = () => false;

export function AutoAtualizar() {
  const router = useRouter();
  const [desistiu, setDesistiu] = useState(false);
  const hidratado = useSyncExternalStore(SEM_INSCRICAO, NO_CLIENTE, NO_SERVIDOR);

  useEffect(() => {
    let tentativas = 0;
    const relogio = window.setInterval(() => {
      if (document.hidden) return;
      tentativas += 1;
      if (tentativas > TENTATIVAS_MAXIMAS) {
        window.clearInterval(relogio);
        setDesistiu(true);
        return;
      }
      router.refresh();
    }, INTERVALO_MS);
    return () => window.clearInterval(relogio);
  }, [router]);

  if (!hidratado) return null;

  return (
    <p
      /* Só a desistência é um evento a anunciar; a frase inicial é contexto. */
      role={desistiu ? 'status' : undefined}
      className="text-caption text-content-subtle"
    >
      {desistiu
        ? 'Parei de conferir sozinho. Recarregue a página para ver o estado mais recente.'
        : `Esta página confere sozinha a cada ${INTERVALO_MS / 1000} segundos — não precisa recarregar.`}
    </p>
  );
}
