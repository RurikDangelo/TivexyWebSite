'use client';

import { Pause, Play, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { INTERVALO_DE_ATUALIZACAO_MS } from '@/lib/chat/model';
import { cn } from '@/lib/utils';

/**
 * A barra que diz de quando é o que está na tela — e que o mantém andando.
 *
 * ## A escolha, dita por extenso
 *
 * Não existe tempo real neste projeto: nem WebSocket, nem Supabase Realtime,
 * nem canal de eventos. Diante disso havia duas saídas honestas — a tela
 * atualizar só ao navegar e **dizer isso**, ou buscar de tempos em tempos e
 * mostrar quando foi a última busca. Esta é a segunda.
 *
 * A terceira saída, que é a proibida, seria uma interface com cara de ao vivo:
 * indicador verde de "conectado", mensagem escorregando para dentro da lista,
 * "digitando…". Nada disso existe aqui, e não é por falta de acabamento.
 *
 * ## Por que `router.refresh()`
 *
 * Ele refaz a renderização no servidor e reconcilia no cliente: o texto que
 * está sendo digitado no campo não se perde, a rolagem não salta e os
 * componentes de cliente não remontam. Um `location.reload()` faria as três
 * coisas erradas. E, por atravessar layouts, é ele que atualiza junto os
 * contadores de não lidas da coluna ao lado.
 */

const CHAVE_DA_PAUSA = 'tivexy-chat-pausado';
const SEGUNDOS = Math.round(INTERVALO_DE_ATUALIZACAO_MS / 1000);

function lerPausa(): boolean {
  try {
    return localStorage.getItem(CHAVE_DA_PAUSA) === '1';
  } catch {
    /* Navegação privada ou site-data bloqueado: não pausado, que é o padrão. */
    return false;
  }
}

/*
 * A pausa vive numa store de módulo, não em `useState`.
 *
 * O motivo imediato: ler `localStorage` dentro de um efeito para depois chamar
 * `setState` pinta uma vez com o valor errado antes de corrigir, e é o padrão
 * que o lint do projeto recusa. `useSyncExternalStore` entrega o valor certo já
 * na primeira pintura do cliente.
 *
 * O motivo que vale mais: o `storage` do navegador dispara em **outras** abas.
 * Assinando-o aqui, pausar a atualização numa aba pausa em todas — que é o que
 * a pessoa quis dizer ao pausar, e não "pare só nesta janela".
 */
let pausaEmMemoria: boolean | null = null;
const ouvintes = new Set<() => void>();

function avisar(): void {
  for (const ouvinte of ouvintes) ouvinte();
}

function assinarPausa(aoMudar: () => void): () => void {
  ouvintes.add(aoMudar);
  const aoTrocarStorage = (evento: StorageEvent) => {
    if (evento.key !== null && evento.key !== CHAVE_DA_PAUSA) return;
    pausaEmMemoria = null; /* releitura na próxima chamada de snapshot */
    aoMudar();
  };
  window.addEventListener('storage', aoTrocarStorage);
  return () => {
    ouvintes.delete(aoMudar);
    window.removeEventListener('storage', aoTrocarStorage);
  };
}

/*
 * O snapshot precisa ser estável entre chamadas ou o React reentra em laço, e
 * `localStorage.getItem` devolve string nova a cada leitura. Daí o cache — que
 * o evento de storage invalida.
 */
function lerPausaSnapshot(): boolean {
  if (pausaEmMemoria === null) pausaEmMemoria = lerPausa();
  return pausaEmMemoria;
}

/* No servidor não há storage, e `false` é o que faz o HTML bater com o cliente. */
const lerPausaNoServidor = () => false;

function gravarPausa(valor: boolean): void {
  pausaEmMemoria = valor;
  try {
    localStorage.setItem(CHAVE_DA_PAUSA, valor ? '1' : '0');
  } catch {
    /* Navegação privada: a escolha ainda vale para esta aba, via `pausaEmMemoria`. */
  }
  avisar();
}

export interface AtualizacaoProps {
  /** ISO do instante em que o servidor montou este HTML. */
  geradoEm: string;
  /** O mesmo instante já formatado no fuso da empresa, para hidratar igual. */
  geradoTexto: string;
}

export function Atualizacao({ geradoEm, geradoTexto }: AtualizacaoProps) {
  const router = useRouter();
  const [atualizando, iniciar] = useTransition();

  const pausado = useSyncExternalStore(assinarPausa, lerPausaSnapshot, lerPausaNoServidor);

  /*
   * "há N s" só existe depois de montar, pelo mesmo motivo: no servidor a
   * diferença é sempre zero. Antes disso a barra mostra só o horário absoluto,
   * que já é a informação principal.
   */
  const [idadeSegundos, setIdadeSegundos] = useState<number | null>(null);
  useEffect(() => {
    const calcular = () =>
      setIdadeSegundos(Math.max(0, Math.round((Date.now() - new Date(geradoEm).getTime()) / 1000)));
    calcular();
    const relogio = setInterval(calcular, 5000);
    return () => clearInterval(relogio);
  }, [geradoEm]);

  /*
   * A aba escondida não busca. Sem isto, dez abas esquecidas abertas viram dez
   * clientes consultando o banco três vezes por minuto para sempre — e nenhum
   * deles com alguém olhando.
   */
  useEffect(() => {
    if (pausado) return;

    const buscar = () => {
      if (document.visibilityState !== 'visible') return;
      router.refresh();
    };
    const relogio = setInterval(buscar, INTERVALO_DE_ATUALIZACAO_MS);

    /* Voltou para a aba: busca na hora, sem esperar o próximo tique. */
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    document.addEventListener('visibilitychange', aoVoltar);

    return () => {
      clearInterval(relogio);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [pausado, router]);

  /* `gravarPausa` avisa a store, e a store reavisa este componente e os outros. */
  const alternarPausa = () => gravarPausa(!pausado);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-card border border-line-subtle bg-surface-sunken px-3 py-2">
      <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-caption text-content-muted">
        {/*
         * "Sem tempo real" vem primeiro e em negrito porque é a informação que
         * corrige a expectativa. O horário sozinho seria lido como detalhe.
         */}
        <span className="text-eyebrow text-content-subtle">Sem tempo real</span>
        <span>
          Visto às <time dateTime={geradoEm}>{geradoTexto}</time>
          {idadeSegundos !== null && idadeSegundos >= 5 && (
            <span aria-hidden> · há {idadeSegundos}s</span>
          )}
        </span>
        <span className="text-content-subtle">
          {pausado ? 'Busca pausada.' : `Busca a cada ${SEGUNDOS}s.`}
        </span>
      </p>

      <div className="flex shrink-0 items-center gap-1">
        {/*
         * A pausa é um botão com `aria-pressed`, e não um Switch: é uma ação
         * que a pessoa dispara, não uma preferência de formulário — e assim
         * dispensa rótulo visível ao lado, que nesta barra não caberia.
         */}
        {/*
         * `aria-describedby` não pode ser escrito aqui: o `Tooltip` injeta o
         * dele no gatilho ao clonar, e o segundo apagaria o primeiro. O que
         * seria a descrição vai para o próprio texto da dica.
         */}
        <Tooltip
          conteudo={
            pausado
              ? 'Voltar a buscar automaticamente'
              : 'Pausar: a conversa só muda ao atualizar na mão'
          }
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-pressed={pausado}
            onClick={alternarPausa}
          >
            {pausado ? <Play aria-hidden /> : <Pause aria-hidden />}
            <span className="sr-only">
              {pausado ? 'Retomar a busca automática' : 'Pausar a busca automática'}
            </span>
          </Button>
        </Tooltip>

        {/*
         * `disabled` em vez de `carregando`: o `Button` desenharia o spinner
         * ao lado do ícone, e ficariam dois círculos girando. Aqui quem gira é
         * o próprio ícone da ação, que é o gesto que a mão espera.
         */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={atualizando}
          aria-busy={atualizando || undefined}
          onClick={() => iniciar(() => router.refresh())}
        >
          <RefreshCw className={cn(atualizando && 'motion-safe:animate-spin')} aria-hidden />
          Atualizar
        </Button>
      </div>
    </div>
  );
}
