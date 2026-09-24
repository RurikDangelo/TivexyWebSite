import { ArrowRight, CalendarClock } from 'lucide-react';

import { formatCents } from '@tivexy/core';
import { Badge } from '@/components/ui/badge';

import { moverOportunidade } from './actions';
import {
  type EtapaDoFunil,
  type OportunidadeListada,
  TIPO_ETAPA_LABEL,
  TIPO_ETAPA_TOM,
} from './state';

/**
 * O quadro do funil: uma coluna por etapa.
 *
 * Componente de servidor, e de propósito — **não há estado de cliente aqui.**
 * Cada movimento é um `form` com Server Action, o que traz duas coisas que
 * arrastar-e-soltar não traz de graça: funciona sem JavaScript, e é operável
 * pelo teclado sem nenhum trabalho extra. Arrastar é mais bonito e é uma
 * decisão separada — quando vier, vem por cima disto, não no lugar.
 *
 * No celular as colunas viram seções empilhadas. Um quadro com rolagem
 * horizontal em 375px esconde metade do funil atrás de um gesto que ninguém
 * descobre.
 */
export function Board({
  etapas,
  oportunidades,
}: {
  etapas: readonly EtapaDoFunil[];
  oportunidades: readonly OportunidadeListada[];
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:overflow-x-auto lg:pb-4">
      {etapas.map((etapa) => (
        <Coluna
          key={etapa.id}
          etapa={etapa}
          etapas={etapas}
          oportunidades={oportunidades.filter((o) => o.etapaId === etapa.id)}
        />
      ))}
    </div>
  );
}

function Coluna({
  etapa,
  etapas,
  oportunidades,
}: {
  etapa: EtapaDoFunil;
  etapas: readonly EtapaDoFunil[];
  oportunidades: readonly OportunidadeListada[];
}) {
  /*
   * A soma em centavos inteiros, nunca em ponto flutuante. É a mesma razão do
   * `bigint` na coluna: uma soma de reais em `float` fecha um centavo fora do
   * extrato, e o erro só aparece no relatório do mês.
   */
  const total = oportunidades.reduce((soma, o) => soma + o.valorCentavos, 0);

  return (
    <section className="lg:w-72 lg:shrink-0">
      <header className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="font-mono text-[0.6875rem] font-medium uppercase tracking-wider text-content-subtle">
          {etapa.nome}
        </h2>
        {etapa.tipo !== 'open' && (
          <Badge tone={TIPO_ETAPA_TOM[etapa.tipo]}>{TIPO_ETAPA_LABEL[etapa.tipo]}</Badge>
        )}
        <span className="ml-auto text-xs text-content-muted">
          {oportunidades.length} · {formatCents(total)}
        </span>
      </header>

      {oportunidades.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-subtle px-3 py-6 text-center text-xs text-content-subtle">
          Vazia
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {oportunidades.map((oportunidade) => (
            <Cartao
              key={oportunidade.id}
              oportunidade={oportunidade}
              etapaAtual={etapa}
              etapas={etapas}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function Cartao({
  oportunidade,
  etapaAtual,
  etapas,
}: {
  oportunidade: OportunidadeListada;
  etapaAtual: EtapaDoFunil;
  etapas: readonly EtapaDoFunil[];
}) {
  /* Quem está do outro lado. A conta primeiro: é o nome que se procura. */
  const contraparte = [oportunidade.empresa, oportunidade.contato].filter(Boolean).join(' · ');
  const destinos = etapas.filter((e) => e.id !== etapaAtual.id);

  return (
    <li className="rounded-lg border border-line-subtle bg-surface-raised p-3">
      <p className="font-medium text-content">{oportunidade.titulo}</p>

      {contraparte !== '' && (
        <p className="mt-0.5 truncate text-sm text-content-muted">{contraparte}</p>
      )}

      <p className="mt-1 font-mono text-sm text-content">
        {formatCents(oportunidade.valorCentavos)}
      </p>

      {oportunidade.previsao !== null && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-content-subtle">
          <CalendarClock className="size-3.5 shrink-0" aria-hidden />
          Previsão: {dataLegivel(oportunidade.previsao)}
        </p>
      )}

      {destinos.length > 0 && (
        <form action={moverOportunidade} className="mt-3 flex items-center gap-1.5">
          <input type="hidden" name="id" value={oportunidade.id} />
          <input type="hidden" name="de" value={etapaAtual.id} />

          {/*
            O rótulo é invisível, não ausente. São vários destes por tela, e um
            `select` sem nome acessível faz o leitor de tela anunciar só o
            nome da etapa atual — sem dizer de qual oportunidade.
          */}
          <label className="sr-only" htmlFor={`mover-${oportunidade.id}`}>
            Mover {oportunidade.titulo} para
          </label>
          <select
            id={`mover-${oportunidade.id}`}
            name="para"
            defaultValue={etapaAtual.id}
            className="h-8 min-w-0 flex-1 rounded-md border border-line-field bg-surface px-2 text-xs text-content"
          >
            <option value={etapaAtual.id}>Mover para…</option>
            {destinos.map((destino) => (
              <option key={destino.id} value={destino.id}>
                {destino.nome}
              </option>
            ))}
          </select>

          <button
            type="submit"
            aria-label={`Mover ${oportunidade.titulo}`}
            className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line-strong text-content-default transition-colors hover:bg-surface-muted"
          >
            <ArrowRight className="size-3.5" aria-hidden />
          </button>
        </form>
      )}
    </li>
  );
}

/**
 * `2026-09-24` vira `24/09/2026`, sem passar por `Date`.
 *
 * `new Date('2026-09-24')` é meia-noite **UTC**, e formatar isso em
 * `America/Sao_Paulo` — três horas atrás — mostra dia 23. Uma coluna `date`
 * não tem hora nem fuso: ela é o dia que alguém escreveu, e o caminho seguro
 * é tratá-la como texto.
 */
function dataLegivel(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}
