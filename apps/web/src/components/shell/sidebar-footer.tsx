'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { ThemeToggle } from '@/components/theme-toggle';
import { classeDeItemDaSidebar } from '@/components/shell/sidebar-nav';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/tooltip';
import { statusLabel, type NavHref, type VisibleItem } from '@/config/navigation';
import { cn } from '@/lib/utils';

/**
 * O pé da coluna: o que é da pessoa, e o que governa a própria coluna.
 *
 * Três defeitos morrem aqui. `/avisos` só era alcançável pelo sino do header, e
 * o sino só existe quando há empresa resolvida; `/conta` só existia dentro do
 * dropdown de conta; e o selo de estágio morava no header, ocupando a faixa
 * mais nobre da tela — a mesma que a busca global queria.
 *
 * Quem decide quais itens aparecem é `utilityNavigation()`, com a mesma regra
 * de rota do menu. Aqui só se desenha, e a altura da linha vem de
 * `classeDeItemDaSidebar` para que a costura entre nav e rodapé não apareça.
 *
 * O modo colapsado é desenhado pelo `data-collapsed` do `<aside>`, como no
 * menu. A prop `colapsada` só decide o que o CSS não decide: montar a dica e
 * virar o seletor de tema de pé.
 */

/*
 * O selo de estágio.
 *
 * Continua visível por padrão porque continua verdade: `docs/PROJECT_STATE.md`
 * é a fonte, e nenhum módulo está fechado de ponta a ponta. A variável existe
 * para que o dia do lançamento não dependa de um commit — enquanto ninguém a
 * define, o selo aparece, que é o lado seguro do erro.
 */
const EM_CONSTRUCAO = process.env.NEXT_PUBLIC_TIVEXY_STAGE !== 'producao';

/**
 * Onde o contador do sino se pendura.
 *
 * Comparação por caminho, conferida contra o item que `utilities` declara: se
 * a tela de avisos mudar de endereço, isto para de compilar em vez de deixar
 * de mostrar o número em silêncio.
 */
const AVISOS: NavHref = '/avisos';

/** Escrito por extenso: o Tailwind lê o arquivo como texto e só gera o que encontra inteiro. */
const ROTULO = 'min-w-0 flex-1 truncate group-data-[collapsed]/sidebar:sr-only';

export interface SidebarFooterProps {
  /** O que `utilityNavigation()` devolveu para esta pessoa. */
  itens: readonly VisibleItem[];
  /**
   * O contador de avisos, no mesmo formato que o layout entrega ao sino.
   * `null` sem empresa escolhida; `naoLidos: null` quando a contagem falhou —
   * e aí a linha vai sem número, em vez de com um zero que mente.
   */
  avisos: { naoLidos: number | null } | null;
  colapsada: boolean;
  /** Ausente na gaveta: ali não há coluna para recolher. */
  aoAlternarColapso?: () => void;
  /** A região que o botão de colapso governa, para o `aria-controls`. */
  idDaNavegacao?: string;
  /** Fecha a gaveta ao navegar. */
  aoNavegar?: () => void;
  className?: string;
}

export function SidebarFooter({
  itens,
  avisos,
  colapsada,
  aoAlternarColapso,
  idDaNavegacao,
  aoNavegar,
  className,
}: SidebarFooterProps) {
  return (
    <div
      className={cn(
        'mt-auto flex shrink-0 flex-col gap-0.5 border-t border-line-subtle p-3',
        'group-data-[collapsed]/sidebar:p-2',
        className,
      )}
    >
      {itens.map((item) => (
        <ItemDoRodape
          key={item.href}
          item={item}
          naoLidos={item.href === AVISOS && avisos !== null ? avisos.naoLidos : null}
          colapsada={colapsada}
          aoNavegar={aoNavegar}
        />
      ))}

      <div
        className={cn(
          'flex items-center py-1',
          colapsada ? 'flex-col' : 'justify-between gap-2 px-2.5',
        )}
      >
        {!colapsada && <span className="text-caption text-content-muted">Tema</span>}
        <ThemeToggle orientacao={colapsada ? 'vertical' : 'horizontal'} />
      </div>

      {aoAlternarColapso !== undefined && (
        <ComDica ativa={colapsada} conteudo="Expandir menu">
          <button
            type="button"
            onClick={aoAlternarColapso}
            /* O botão governa a região da navegação: é ela que encolhe. */
            aria-expanded={!colapsada}
            aria-controls={idDaNavegacao}
            className={cn(
              classeDeItemDaSidebar,
              'text-content-muted hover:bg-surface-muted hover:text-content',
            )}
          >
            {colapsada ? (
              <PanelLeftOpen className="size-4 shrink-0" aria-hidden />
            ) : (
              <PanelLeftClose className="size-4 shrink-0" aria-hidden />
            )}
            <span className={ROTULO}>{colapsada ? 'Expandir menu' : 'Recolher menu'}</span>
          </button>
        </ComDica>
      )}

      {/*
       * Colapsado, o selo sai: são duas palavras num trilho de 64px. A
       * informação não se perde — volta inteira ao expandir, e
       * `docs/PROJECT_STATE.md` continua sendo onde ela é dita por extenso.
       */}
      {EM_CONSTRUCAO && (
        <Badge
          tone="warning"
          tamanho="xs"
          className="mx-2.5 mt-1 self-start group-data-[collapsed]/sidebar:hidden"
        >
          Em construção
        </Badge>
      )}
    </div>
  );
}

/** O número por extenso, com plural certo — é o que o leitor de tela ouve. */
function rotuloComContador(rotulo: string, naoLidos: number | null): string {
  if (naoLidos === null || naoLidos === 0) return rotulo;
  const quantos = naoLidos.toLocaleString('pt-BR');
  return `${rotulo}: ${quantos} ${naoLidos === 1 ? 'não lido' : 'não lidos'}`;
}

function ItemDoRodape({
  item,
  naoLidos,
  colapsada,
  aoNavegar,
}: {
  item: VisibleItem;
  /** Só o item de avisos recebe número; nos outros é sempre `null`. */
  naoLidos: number | null;
  colapsada: boolean;
  aoNavegar?: () => void;
}) {
  const Icone = item.icon;
  const nome = rotuloComContador(item.label, naoLidos);
  /* `number` em vez de um booleano à parte: o estreitamento acompanha o valor. */
  const espera = naoLidos !== null && naoLidos > 0 ? naoLidos : null;

  /*
   * A maquinaria de estado honesto do menu vale aqui também: um item que a
   * tela ainda não tem não pode ser um link que leva a lugar nenhum.
   */
  if (item.status !== 'ready') {
    return (
      <span
        aria-disabled="true"
        className={cn(classeDeItemDaSidebar, 'cursor-not-allowed text-content-subtle')}
      >
        <Icone className="size-4 shrink-0 opacity-60" aria-hidden />
        <span className={ROTULO}>{item.label}</span>
        <span className="sr-only">({statusLabel[item.status]})</span>
      </span>
    );
  }

  return (
    <ComDica ativa={colapsada} conteudo={nome}>
      <Link
        href={item.href}
        onClick={aoNavegar}
        /* O nome acessível carrega o contador; o selo ao lado é só visual. */
        aria-label={nome === item.label ? undefined : nome}
        className={cn(
          classeDeItemDaSidebar,
          'text-content-default hover:bg-surface-muted hover:text-content',
        )}
      >
        <span className="relative flex shrink-0">
          <Icone className="size-4" aria-hidden />
          {/* No trilho o número não cabe, mas a existência dele sim. */}
          {espera !== null && (
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 hidden size-1.5 rounded-pill bg-danger group-data-[collapsed]/sidebar:block"
            />
          )}
        </span>
        <span className={ROTULO}>{item.label}</span>
        {espera !== null && (
          /* `Icone={null}`: o selo aqui é um número, e o triângulo do tom danger
           * competiria com o próprio dígito. */
          <Badge
            tone="danger"
            tamanho="xs"
            Icone={null}
            className="shrink-0 tabular-nums group-data-[collapsed]/sidebar:hidden"
          >
            {espera > 99 ? '99+' : espera}
          </Badge>
        )}
      </Link>
    </ComDica>
  );
}

/** Dica só no trilho: com o rótulo escrito ao lado, ela seria eco. */
function ComDica({
  ativa,
  conteudo,
  children,
}: {
  ativa: boolean;
  conteudo: string;
  children: ReactNode;
}) {
  if (!ativa) return children;
  /*
   * O `<span>` intermediário existe porque o `Tooltip` clona o filho para
   * pendurar `aria-describedby` nele — e aqui o filho pode ser um `<button>`
   * ou um `<Link>`, dos quais só um sabe o que fazer com a prop. O foco
   * borbulha, então a dica continua abrindo pelo teclado.
   */
  return (
    <Tooltip conteudo={conteudo} lado="direita" className="w-full">
      <span className="flex w-full">{children}</span>
    </Tooltip>
  );
}
