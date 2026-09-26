'use client';

import { Search, X } from 'lucide-react';
import { useId, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/*
 * Busca por GET, no endereço.
 *
 * Buscar não muda estado, então é link: o resultado pode ser copiado, voltado
 * com o botão do navegador e mandado para quem vai conferir junto. Sem
 * JavaScript o campo continua funcionando — quem submete é o formulário.
 *
 * O módulo é cliente por um motivo só: limpar é um evento. É folha da árvore —
 * quem renderiza a busca continua sendo Server Component.
 */

export interface SearchFieldProps {
  /** `name` do parâmetro na URL. `q` em toda lista; o ERP tem campos próprios. */
  nome?: string;
  /**
   * O termo JÁ APLICADO, lido de `searchParams` — não o que está sendo
   * digitado. É ele que diz se limpar precisa recarregar a lista.
   */
  valor: string;
  /** Rótulo acessível. Fica oculto: a lupa basta para quem enxerga. */
  rotulo: string;
  /** Obrigatório: é `:placeholder-shown` que esconde o X quando o campo esvazia. */
  placeholder: string;
  className?: string;
}

/**
 * O campo de busca sozinho, sem formulário em volta.
 *
 * Existe para que a `FilterBar` e o ERP parem de montar `<Input type="search">`
 * cru cada um do seu jeito: a lupa e o botão de limpar moram dentro do campo,
 * em um lugar só.
 */
export function SearchField({
  nome = 'q',
  valor,
  rotulo,
  placeholder,
  className,
}: SearchFieldProps) {
  const campo = useRef<HTMLInputElement>(null);
  /* `useId` porque duas buscas na mesma tela colidiriam no `id="q"` fixo. */
  const id = useId();

  /*
   * Com busca aplicada, limpar recarrega a lista: o X promete resultado sem
   * filtro, e deixar a lista filtrada na tela depois dele é mentir. Sem nada
   * aplicado ainda, só apaga o que foi digitado e devolve o foco ao campo.
   */
  function limpar() {
    const alvo = campo.current;
    if (alvo === null) return;
    alvo.value = '';
    alvo.focus();
    if (valor !== '') alvo.form?.requestSubmit();
  }

  return (
    <div className={cn('relative min-w-0', className)}>
      <Label htmlFor={id} className="sr-only">
        {rotulo}
      </Label>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-content-subtle"
      />
      <Input
        ref={campo}
        id={id}
        name={nome}
        type="search"
        defaultValue={valor}
        placeholder={placeholder}
        enterKeyHint="search"
        /*
         * `peer` habilita o `peer-placeholder-shown` do botão abaixo. O padding
         * é declarado dos dois lados de propósito: `pl-9` sozinho anularia o
         * `px-3` do Input e o texto passaria por baixo do X.
         *
         * Raio e tipografia ficam com o `Input` — a barra tem select ao lado, e
         * um campo com raio próprio destoaria do vizinho.
         */
        className="peer pr-9 pl-9 [&::-webkit-search-cancel-button]:appearance-none"
      />
      <button
        type="button"
        onClick={limpar}
        aria-label="Limpar busca"
        /*
         * `invisible`, não `hidden`: sai do fluxo de foco e da árvore de
         * acessibilidade sem mexer no layout do campo enquanto se digita.
         */
        className={cn(
          'absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center',
          /* `transition-colors` antes de `transition-base`: a utilidade da casa
             só troca duração e curva, e sem ela a transição herdaria `all` —
             que atrasaria o próprio sumiço do botão em 150ms. */
          'rounded-control text-content-subtle transition-colors transition-base',
          'hover:bg-surface-muted hover:text-content',
          'peer-placeholder-shown:invisible',
        )}
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}

export interface SearchBoxProps {
  valor: string;
  rotulo: string;
  placeholder: string;
  nome?: string;
  /** Destino do GET. Omitido, é a própria rota — a query atual é reescrita. */
  acao?: string;
  /** Parâmetros que precisam sobreviver à busca (aba, ordem). */
  ocultos?: Readonly<Record<string, string>>;
  className?: string;
}

/**
 * Busca isolada, sem filtros ao lado — as listas do CRM.
 *
 * Quando houver select junto, use `FilterBar`: é ela que resolve o
 * empilhamento, e é por não existir que nasceram quatro grades divergentes.
 */
export function SearchBox({
  valor,
  rotulo,
  placeholder,
  nome = 'q',
  acao,
  ocultos,
  className,
}: SearchBoxProps) {
  return (
    <form
      role="search"
      method="get"
      action={acao}
      className={cn('flex w-full gap-2 sm:max-w-md', className)}
    >
      {ocultos !== undefined &&
        Object.entries(ocultos).map(([chave, conteudo]) => (
          <input key={chave} type="hidden" name={chave} value={conteudo} />
        ))}
      <SearchField
        nome={nome}
        valor={valor}
        rotulo={rotulo}
        placeholder={placeholder}
        className="flex-1"
      />
      <Button type="submit" variant="outline">
        Buscar
      </Button>
    </form>
  );
}
