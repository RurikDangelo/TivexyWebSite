'use client';

import {
  AlarmClock,
  Building2,
  CheckCircle2,
  Circle,
  Contact,
  Target,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';
import { useOptimistic, useState, useTransition } from 'react';

import { FormError } from '@/components/form/messages';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { SectionLabel } from '@/components/ui/section-label';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import type { TipoDeAlvo } from '@/lib/crm/activity-input';
import { atrasoDaLinha, cn } from '@/lib/utils';

import { concluirAtividade } from './actions';
import type { ItemDaAgenda } from './state';

export interface SecaoDaAgenda {
  chave: string;
  titulo: string;
  itens: readonly ItemDaAgenda[];
  /** Seção que avisa — as atrasadas. Tem texto além da cor. */
  alerta?: boolean;
  /** A faixa parou no teto da consulta: o que se vê é um recorte, e ela diz isso. */
  truncada?: boolean;
}

const ALVO: Record<TipoDeAlvo, { Icone: typeof Contact; caminho: string }> = {
  lead: { Icone: Target, caminho: '/crm/leads' },
  contato: { Icone: Contact, caminho: '/crm/contatos/' },
  conta: { Icone: Building2, caminho: '/crm/empresas/' },
  negocio: { Icone: Workflow, caminho: '/crm/oportunidades/' },
};

function hrefDoAlvo(alvo: NonNullable<ItemDaAgenda['alvo']>): string {
  /* Lead não tem página própria: a fila é a página. */
  return alvo.tipo === 'lead' ? ALVO.lead.caminho : `${ALVO[alvo.tipo].caminho}${alvo.id}`;
}

export interface AgendaListProps {
  secoes: readonly SecaoDaAgenda[];
  podeEditar: boolean;
  /** Na página de uma pessoa, o alvo é ela: não precisa repetir em cada linha. */
  mostrarAlvo?: boolean;
  /**
   * A agenda de dentro de um `<Card>` (o painel de um registro). Perde a
   * moldura própria — borda dentro de borda lê como defeito — e aperta a linha,
   * porque ali ela divide altura com o resto da página.
   */
  dentroDeCartao?: boolean;
}

/**
 * A agenda como tabela, em faixas: com atraso, hoje, amanhã, a semana, depois.
 *
 * Era um `<ul>` de blocos de ~64px — o mesmo contêiner copiado em onze telas —
 * onde assunto, hora, tipo, alvo e responsável se empilhavam dentro da linha.
 * Em coluna, a linha cai para 44px e a varredura vertical passa a funcionar:
 * o olho compara "quando" com "quando", não com o próximo assunto.
 *
 * Por que NÃO há ordenação por coluna, embora o `<TH ordem>` exista: a ordem
 * desta tela é a faixa (vence antes, aparece antes), e é ela que dá sentido aos
 * cabeçalhos de grupo. Um `?ordem=responsavel` dissolveria as faixas, e um link
 * de ordenação que o servidor ignora seria um controle que mente.
 *
 * Concluir é um clique, e o item risca na hora (`useOptimistic`); se o servidor
 * recusar, ele volta. Confirmado, a linha pulsa onde está (`tvx-highlight`) —
 * a faixa só muda no próximo carregamento, e sem o pulso a ação não tem eco.
 */
export function AgendaList({
  secoes,
  podeEditar,
  mostrarAlvo = true,
  dentroDeCartao = false,
}: AgendaListProps) {
  /* O que foi clicado e o servidor ainda não confirmou. Sem entrada, vale o que veio do banco. */
  const [mudancas, marcar] = useOptimistic(
    new Map<string, boolean>(),
    (atual: Map<string, boolean>, mudanca: { id: string; feita: boolean }) =>
      new Map(atual).set(mudanca.id, mudanca.feita),
  );
  const [, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState('');
  /** A última linha que o servidor confirmou — é ela que pulsa. */
  const [pulso, setPulso] = useState<string | null>(null);

  function alternar(item: ItemDaAgenda, feita: boolean) {
    setErro(null);
    iniciar(async () => {
      marcar({ id: item.id, feita });
      const r = await concluirAtividade(item.id, feita);
      if (r.erro !== null) {
        setErro(r.erro);
        return;
      }
      setPulso(item.id);
      setAnuncio(feita ? `"${item.assunto}" concluído.` : `"${item.assunto}" reaberto.`);
    });
  }

  const visiveis = secoes.filter((s) => s.itens.length > 0);
  if (visiveis.length === 0) return null;

  const colunas = mostrarAlvo ? 6 : 5;
  /*
   * O atraso escalonado conta a agenda inteira, e não cada faixa: a segunda
   * faixa reiniciando do zero lê como duas listas, não como uma.
   *
   * Por que não há guarda de "primeira vez" (seção 8, regra 3): a chave da
   * linha é o id da atividade, então filtrar por "sou responsável" preserva os
   * nós das linhas que sobrevivem — o React não as remonta e a animação, que é
   * de montagem, não roda de novo. Quem anima é só o que de fato acabou de
   * chegar, que é o comportamento pedido. Uma guarda em `useRef` daria o mesmo
   * resultado lendo a ref durante o render, o que a regra do React proíbe.
   */
  let ordemNaTela = 0;

  return (
    <div className="flex flex-col gap-3">
      <p aria-live="polite" className="sr-only">
        {anuncio}
      </p>
      {erro !== null && <FormError>{erro}</FormError>}

      <Table
        densidade={dentroDeCartao ? 'densa' : 'larga'}
        moldura={dentroDeCartao ? 'nenhuma' : 'painel'}
        mobile="blocos"
        rotulo="Agenda de atividades"
      >
        <THead sticky={!dentroDeCartao}>
          <tr role="row">
            {/*
             * Sem texto visível: o cabeçalho de uma coluna de caixas de marcar
             * seria mais largo que a coluna. `w-px` encolhe a coluna até o
             * conteúdo — é como o `<TD acoes>` do primitivo faz.
             */}
            <TH className="w-px">
              <span className="sr-only">Concluída</span>
            </TH>
            <TH>Assunto</TH>
            <TH className="w-44">Quando</TH>
            <TH className="w-32">Tipo</TH>
            {mostrarAlvo && <TH className="w-48">Sobre</TH>}
            <TH className="w-40">Responsável</TH>
          </tr>
        </THead>

        {visiveis.map((secao) => (
          /*
           * Um `<tbody>` por faixa, com nome acessível próprio: é o que faz o
           * leitor de tela anunciar "Com atraso" ao entrar no grupo, sem
           * promover a faixa a heading dentro de uma tabela.
           */
          <TBody key={secao.chave} aria-label={secao.titulo}>
            <tr role="row" className="bg-surface-sunken">
              <td
                role="cell"
                colSpan={colunas}
                className="border-b border-line-subtle px-4 py-1.5 max-md:px-0"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <SectionLabel
                    Icone={secao.alerta === true ? AlarmClock : undefined}
                    className={secao.alerta === true ? 'text-danger' : undefined}
                  >
                    {secao.titulo}
                  </SectionLabel>
                  <span className="text-caption tabular-nums text-content-subtle">
                    {secao.itens.length}
                    {/* Piso, não total: a consulta parou aqui e a faixa não esconde isso. */}
                    {secao.truncada === true && ' ou mais'}
                  </span>
                </div>
              </td>
            </tr>

            {secao.itens.map((item) => {
              const concluida = mudancas.get(item.id) ?? item.faixa === 'done';
              const alvo = item.alvo;
              const pulsando = pulso === item.id;
              /* Confirmada, a linha pulsa onde está — nunca reaparece a partir de `opacity: 0` (regra 4). */
              const escalonar = !pulsando;
              const indice = ordemNaTela++;

              return (
                <TR
                  key={item.id}
                  className={cn(
                    'hover:bg-surface-subtle',
                    pulsando && 'animate-highlight',
                    escalonar && 'animate-enter',
                  )}
                  style={escalonar ? { animationDelay: atrasoDaLinha(indice) } : undefined}
                >
                  <TD className="w-px align-top md:align-middle">
                    <button
                      type="button"
                      disabled={!podeEditar}
                      onClick={() => alternar(item, !concluida)}
                      aria-label={
                        concluida ? `Reabrir: ${item.assunto}` : `Concluir: ${item.assunto}`
                      }
                      aria-pressed={concluida}
                      /*
                       * 36px de alvo (WCAG 2.5.8 pede 24) sem engordar a linha:
                       * a margem negativa devolve ao fluxo os 6px que o padding
                       * acrescentou de cada lado. No modo blocos não há linha
                       * para preservar, e a margem negativa só encavalaria.
                       */
                      className="grid size-9 place-items-center rounded-pill text-content-subtle transition-colors transition-base not-disabled:hover:text-success disabled:cursor-not-allowed disabled:opacity-60 md:-my-1.5"
                    >
                      {concluida ? (
                        <CheckCircle2 className="size-5 text-success" aria-hidden />
                      ) : (
                        <Circle className="size-5" aria-hidden />
                      )}
                    </button>
                  </TD>

                  <TD className="max-w-0">
                    <span
                      className={cn(
                        'block truncate text-body font-medium',
                        concluida ? 'text-content-muted line-through' : 'text-content',
                      )}
                    >
                      {item.assunto}
                    </span>
                    {item.notas !== null && (
                      <span className="mt-0.5 block truncate text-caption text-content-subtle">
                        {item.notas}
                      </span>
                    )}
                  </TD>

                  <TD rotulo="Quando">
                    {/* Um item de flex só do lado do valor: no modo blocos o rótulo fica à esquerda e isto tudo à direita. */}
                    <span className="flex flex-col gap-0.5 max-md:items-end">
                      {item.quando === null ? (
                        <span className="text-caption text-content-subtle">Sem data</span>
                      ) : (
                        <span className="text-num text-content-default">{item.quando}</span>
                      )}
                      {item.atraso !== null && item.faixa === 'overdue' && !concluida && (
                        /* Cor nunca sozinha: o relógio e a palavra "Venceu" dizem o mesmo que o vermelho. */
                        <span className="flex items-center gap-1 text-caption font-medium text-danger">
                          <AlarmClock className="size-3.5 shrink-0" aria-hidden />
                          Venceu {item.atraso}
                        </span>
                      )}
                    </span>
                  </TD>

                  <TD rotulo="Tipo" truncar>
                    {item.tipo === null ? (
                      <span className="text-caption text-content-subtle">—</span>
                    ) : (
                      <Badge tamanho="xs" className="max-w-full">
                        <span className="truncate">{item.tipo}</span>
                      </Badge>
                    )}
                  </TD>

                  {mostrarAlvo && (
                    <TD rotulo="Sobre" truncar>
                      {alvo === null ? (
                        <span className="text-caption text-content-subtle">—</span>
                      ) : (
                        <Link
                          href={hrefDoAlvo(alvo)}
                          className="inline-flex min-h-6 max-w-full items-center gap-1.5 rounded-control text-caption text-content-accent transition-colors transition-base hover:underline"
                        >
                          {(() => {
                            const { Icone } = ALVO[alvo.tipo];
                            return <Icone className="size-3.5 shrink-0" aria-hidden />;
                          })()}
                          <span className="truncate">{alvo.nome}</span>
                        </Link>
                      )}
                    </TD>
                  )}

                  <TD rotulo="Responsável" truncar>
                    {item.responsavel === null ? (
                      <span className="text-caption text-content-subtle">—</span>
                    ) : (
                      <span className="flex min-w-0 items-center gap-2">
                        <Avatar nome={item.responsavel} tamanho="xs" />
                        <span className="truncate text-caption text-content-muted">
                          {item.responsavel}
                        </span>
                      </span>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        ))}
      </Table>
    </div>
  );
}
