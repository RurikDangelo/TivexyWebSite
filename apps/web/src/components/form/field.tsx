import { type ReactNode, useId } from 'react';

import { Label } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Como o rótulo se posiciona em relação ao controle. */
export type OrientacaoDeCampo = 'vertical' | 'horizontal';

export interface FieldProps {
  /** Base do id. Vira `${escopo}-${nome}` quando há escopo. */
  nome: string;
  rotulo: string;
  obrigatorio?: boolean;
  dica?: string;
  erro?: string;
  /**
   * Prefixo dos ids deste campo.
   *
   * Existe porque duas telas de detalhe põem dois formulários na mesma página
   * — em `/crm/contatos/[id]` o cadastro do contato e o de atividade disputam
   * `notas` e `responsavel`. Com id repetido o `<label>` aponta para o
   * primeiro elemento que casar, e clicar no rótulo do segundo foca o campo
   * errado.
   */
  escopo?: string;
  /** Mantém o rótulo para o leitor de tela e o tira da tela. */
  rotuloOculto?: boolean;
  orientacao?: OrientacaoDeCampo;
  className?: string;
  children: ReactNode;
}

/**
 * Rótulo, controle, dica e erro — com os ids ligados.
 *
 * O controle chega pronto em `children`, e quem liga `aria-describedby` a ele
 * é quem monta: `describedBy(nome, erro, dica, escopo)` devolve a lista certa e
 * `idDoCampo(nome, escopo)` devolve o id que o rótulo está esperando. Ligar à
 * mão em cada tela é o que faz um erro de campo existir na tela e não existir
 * para o leitor de tela.
 */
export function Field({
  nome,
  rotulo,
  obrigatorio = false,
  dica,
  erro,
  escopo,
  rotuloOculto = false,
  orientacao = 'vertical',
  className,
  children,
}: FieldProps) {
  const id = idDoCampo(nome, escopo);

  // Rótulo oculto sai do fluxo: mantê-lo em duas colunas deixaria uma faixa de
  // 12rem vazia à esquerda do controle.
  const emColunas = orientacao === 'horizontal' && !rotuloOculto;

  const corpo = (
    <>
      {children}
      {erro !== undefined && (
        <p id={`${id}-erro`} role="alert" className="text-caption text-danger">
          {erro}
        </p>
      )}
      {dica !== undefined && (
        <p id={`${id}-dica`} className="text-caption text-content-subtle">
          {dica}
        </p>
      )}
    </>
  );

  return (
    <div
      className={cn(
        'min-w-0',
        emColunas
          ? 'grid gap-1.5 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:items-start sm:gap-x-4'
          : 'flex flex-col gap-1.5',
        className,
      )}
    >
      <Label
        htmlFor={id}
        className={cn('text-label', rotuloOculto && 'sr-only', emColunas && 'sm:pt-2')}
      >
        {rotulo}
        {!obrigatorio && <span className="ml-1 text-caption text-content-subtle">(opcional)</span>}
      </Label>
      {emColunas ? (
        <div className="flex min-w-0 flex-col gap-1.5 sm:col-start-2">{corpo}</div>
      ) : (
        corpo
      )}
    </div>
  );
}

/** O id que o `Field` dá ao controle — use o mesmo no `id=` do `<Input>`. */
export function idDoCampo(nome: string, escopo?: string): string {
  return escopo === undefined || escopo === '' ? nome : `${escopo}-${nome}`;
}

/** O `aria-describedby` do controle de um `Field`. */
export function describedBy(
  nome: string,
  erro?: string,
  dica?: string,
  escopo?: string,
): string | undefined {
  const id = idDoCampo(nome, escopo);
  const ids: string[] = [];
  if (erro !== undefined) ids.push(`${id}-erro`);
  if (dica !== undefined) ids.push(`${id}-dica`);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

/**
 * Escopo único para um formulário que pode aparecer duas vezes na mesma página.
 *
 * O `useId` fica aqui e não dentro do `Field` por dois motivos: hook tornaria
 * todo `Field` — e com ele toda tela de formulário — componente de cliente; e
 * o id precisa ser conhecido por quem monta o controle, que é o chamador.
 * Quando a colisão é conhecida de antemão, um `escopo="contato"` literal é
 * melhor: lê-se no DOM e sobrevive a um diff.
 */
export function useEscopo(): string {
  // O valor entra em `aria-describedby`, que é lista separada por espaço, e o
  // formato do `useId` já mudou entre versões do React (`:r0:` → `«r0»`).
  return useId().replace(/[^A-Za-z0-9_-]/g, '');
}
