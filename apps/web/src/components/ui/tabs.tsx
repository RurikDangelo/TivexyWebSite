import Link from 'next/link';

import { cn } from '@/lib/utils';

export interface ItemDeAba<Chave extends string = string> {
  chave: Chave;
  rotulo: string;
  href: string;
}

export interface TabsProps<Chave extends string = string> {
  /**
   * Nome acessível do conjunto — vira o `aria-label` do landmark.
   * Sem ele, uma tela com duas navegações anuncia "navegação" duas vezes.
   */
  rotulo: string;
  itens: readonly ItemDeAba<Chave>[];
  /**
   * `NoInfer` fecha a porta para um valor que não existe em `itens`: sem ele,
   * um typo em `ativa` só apareceria como uma barra de abas sem nenhuma ativa.
   */
  ativa: NoInfer<Chave>;
  className?: string;
}

/**
 * Abas de navegação: cada uma é um endereço, e trocar de aba é trocar de tela.
 *
 * Deliberadamente **não** é o padrão ARIA `tablist`/`tabpanel`. Aquele pressupõe
 * painéis no mesmo documento, com a seta trocando o conteúdo sem sair da página,
 * e exige roving tabindex. Aqui são links de verdade: entram no histórico, abrem
 * em nova aba pelo meio do mouse, e o leitor de tela anuncia "página atual".
 * Trocar por `role="tablist"` seria regressão disfarçada de conserto.
 *
 * Substitui `StockTabs` e `FinanceTabs`, que eram o mesmo componente copiado.
 */
export function Tabs<Chave extends string>({ rotulo, itens, ativa, className }: TabsProps<Chave>) {
  if (itens.length === 0) return null;

  return (
    <nav
      aria-label={rotulo}
      className={cn(
        /*
         * `overflow-x-auto` sempre, não só abaixo de `sm`: a lista cresce com o
         * módulo, e a alternativa — quebrar em duas linhas — desfaz a régua do
         * sublinhado, que é o que dá a esta faixa cara de aba.
         *
         * A barra de rolagem some porque pousaria exatamente sobre a linha de
         * base. Nada se perde: cada aba é um link, alcançável por Tab, e o
         * navegador rola até ela sozinho ao focar.
         */
        'flex gap-2 overflow-x-auto border-b border-line-subtle',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {itens.map((item) => {
        const ativo = item.chave === ativa;
        return (
          <Link
            key={item.chave}
            href={item.href}
            aria-current={ativo ? 'page' : undefined}
            className={cn(
              /*
               * `border-b-2` em todas, transparente nas inativas: a aba ativa
               * não pode empurrar as vizinhas ao ganhar o sublinhado. O `-mb-px`
               * sobe a borda de 2px por cima da linha de 1px do próprio `<nav>`.
               *
               * `text-label` fixa o peso em 500 para ativa e inativa. Engrossar
               * a ativa mudaria a largura dela e faria a fileira inteira pular a
               * cada navegação; cor e sublinhado já dizem qual é.
               */
              '-mb-px shrink-0 border-b-2 px-3 py-2.5 text-label whitespace-nowrap',
              'transition-colors transition-base',
              /*
               * Anel de foco para dentro. Rolagem no eixo x obriga o navegador a
               * recortar também o eixo y, então um outline com deslocamento
               * positivo apareceria pela metade — ou não apareceria.
               */
              'focus-visible:-outline-offset-2',
              /*
               * Sublinhado em `content-accent`, não em `surface-brand`: no
               * escuro o azul de superfície (blue-500) sobre navy-950 dá
               * 2,6:1, abaixo dos 3:1 que um indicador de estado precisa.
               * `content-accent` clareia junto com o tema e dá 8,7:1 lá e
               * 7,7:1 no claro. O texto da ativa fica em `content` de
               * qualquer jeito — a cor nunca carrega o estado sozinha.
               */
              ativo
                ? 'border-content-accent text-content'
                : 'border-transparent text-content-muted hover:border-line-strong hover:text-content',
            )}
          >
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
