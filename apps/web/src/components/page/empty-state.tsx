import { AlertTriangle, Inbox, SearchX, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Três ausências diferentes, que hoje se confundem numa área em branco só:
 *
 * - `vazio`: ainda não existe registro. A pessoa precisa saber como criar o primeiro.
 * - `busca`: existe registro, mas nenhum passa pelo filtro. A saída é afrouxar o filtro.
 * - `erro`: a leitura falhou. Não se sabe se existe — e insistir é a ação certa.
 */
export type EstadoDeVazio = 'vazio' | 'busca' | 'erro';

export interface EmptyStateProps {
  /** Sem ícone, vale o do estado. Passe um do domínio quando ele disser mais (um funil, um pacote). */
  icone?: LucideIcon;
  /** O que está vazio. */
  titulo: string;
  /** Por que isto importa e o que faz deixar de estar vazio. Obrigatório: é metade da resposta. */
  children: ReactNode;
  /** O que fazer agora, quando há um caminho clicável. Sem permissão de escrita não há ação, e a frase basta. */
  acao?: ReactNode;
  estado?: EstadoDeVazio;
  /** `compacta` dentro de tabela e card, onde o bloco divide altura com o resto. */
  densidade?: 'confortavel' | 'compacta';
  /** `false` quando o pai já desenha a borda — evita a moldura dentro da moldura. */
  moldura?: boolean;
  className?: string;
}

const ICONE_DO_ESTADO: Record<EstadoDeVazio, LucideIcon> = {
  vazio: Inbox,
  busca: SearchX,
  erro: AlertTriangle,
};

/*
 * O tracejado significa "espera para ser preenchido". Busca e erro não esperam
 * nada: uma achou o lugar certo e não achou o dado, a outra nem chegou a olhar.
 * Por isso elas ganham borda contínua — a diferença é visível antes de ler.
 */
const MOLDURA_DO_ESTADO: Record<EstadoDeVazio, string> = {
  vazio: 'border-dashed border-line',
  busca: 'border-line-subtle',
  erro: 'border-line-subtle',
};

/* Cor nunca sozinha (R8): o círculo vermelho vem sempre com o ícone de alerta e a palavra do título. */
const CIRCULO_DO_ESTADO: Record<EstadoDeVazio, string> = {
  vazio: 'bg-surface-sunken text-content-subtle',
  busca: 'bg-surface-sunken text-content-subtle',
  erro: 'bg-danger-soft text-danger',
};

/**
 * O que a tela diz quando não há nada.
 *
 * Toda instância responde três coisas: o que está vazio (`titulo`), por que
 * importa (`children`) e o que fazer agora (`acao`, ou a própria frase quando
 * não há ação disponível para quem está vendo). É por isso que `children` é
 * obrigatório — um estado vazio sem explicação é a área em branco de novo.
 *
 * Nada aqui inventa conteúdo de exemplo: vazio é vazio, e se diz vazio.
 */
export function EmptyState({
  icone,
  titulo,
  children,
  acao,
  estado = 'vazio',
  densidade = 'confortavel',
  moldura = true,
  className,
}: EmptyStateProps) {
  const Icone = icone ?? ICONE_DO_ESTADO[estado];

  return (
    <div
      /*
       * A falha é o único dos três que é um evento: quando ela aparece depois de
       * uma navegação no cliente, o leitor de tela precisa ser avisado. Vazio e
       * busca sem resultado são o conteúdo normal da página, não um alerta.
       */
      role={estado === 'erro' ? 'alert' : undefined}
      className={cn(
        'flex flex-col items-center gap-3 px-6 text-center',
        densidade === 'compacta' ? 'py-6' : 'py-10',
        moldura === true && cn('rounded-card border', MOLDURA_DO_ESTADO[estado]),
        className,
      )}
    >
      <span
        className={cn(
          'flex size-12 shrink-0 items-center justify-center rounded-pill',
          CIRCULO_DO_ESTADO[estado],
        )}
      >
        <Icone className="size-5" aria-hidden />
      </span>

      <div className="flex max-w-md flex-col gap-1">
        {/* `text-content` explícito: a regra base de h1-h4 saiu da folha, e o token não carrega cor. */}
        <h2 className="text-h3 text-balance text-content">{titulo}</h2>
        <div className="text-body text-pretty text-content-muted">{children}</div>
      </div>

      {acao !== undefined && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{acao}</div>
      )}
    </div>
  );
}
