'use client';

import { Check, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useEffect, useRef } from 'react';

import { FormError, FormSuccess } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { contagem } from '@/lib/format';

import { ACAO_INICIAL } from '../state';
import { criarCategoria, excluirCategoria, renomearCategoria } from './actions';

export interface CategoriaNaTela {
  id: string;
  nome: string;
  produtos: number;
}

function Linha({
  categoria,
  podeEditar,
  rotulo,
}: {
  categoria: CategoriaNaTela;
  podeEditar: boolean;
  rotulo: { singular: string; plural: string };
}) {
  const [renomeado, renomear] = useActionState(renomearCategoria, ACAO_INICIAL);
  const [excluido, excluir] = useActionState(excluirCategoria, ACAO_INICIAL);
  const { id, nome, produtos } = categoria;
  const quantos = contagem(produtos, rotulo.singular, rotulo.plural);
  const listar = (
    <Link
      href={`/erp/produtos?categoria=${id}&situacao=todos`}
      className="shrink-0 text-xs text-content-accent hover:underline"
    >
      {quantos}
    </Link>
  );

  if (!podeEditar) {
    return (
      <li className="flex items-center justify-between gap-3 py-2.5 text-sm">
        <span className="min-w-0 truncate text-content">{nome}</span>
        {listar}
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex items-center gap-1.5">
        <form action={renomear} className="flex min-w-0 flex-1 items-center gap-1.5">
          <input type="hidden" name="id" value={id} />
          <Label htmlFor={`categoria-${id}`} className="sr-only">
            Nome da categoria {nome}
          </Label>
          <Input
            id={`categoria-${id}`}
            name="nome"
            defaultValue={nome}
            required
            maxLength={60}
            className="h-8"
          />
          <Submit
            variant="ghost"
            size="icon"
            className="size-8"
            pendente=""
            aria-label={`Salvar o nome de ${nome}`}
          >
            <Check aria-hidden />
          </Submit>
        </form>
        <form
          action={excluir}
          onSubmit={(ev) => {
            const aviso =
              produtos === 0
                ? `Apagar a categoria "${nome}"?`
                : `Apagar a categoria "${nome}"? ${quantos} ficam sem categoria — nada é apagado.`;
            if (!window.confirm(aviso)) ev.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Apagar a categoria ${nome}`}
          >
            <Trash2 aria-hidden />
          </Button>
        </form>
      </div>
      <div className="flex items-center justify-between gap-2 pl-0.5">
        {listar}
        {renomeado.ok !== null && <FormSuccess>{renomeado.ok}</FormSuccess>}
      </div>
      {renomeado.erro !== null && <FormError>{renomeado.erro}</FormError>}
      {excluido.erro !== null && <FormError>{excluido.erro}</FormError>}
    </li>
  );
}

export function Categories({
  categorias,
  podeEditar,
  rotulo,
}: {
  categorias: readonly CategoriaNaTela[];
  podeEditar: boolean;
  rotulo: { singular: string; plural: string };
}) {
  const [estado, criar] = useActionState(criarCategoria, ACAO_INICIAL);
  const formulario = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.ok !== null) formulario.current?.reset();
  }, [estado]);

  return (
    <div className="flex flex-col gap-4">
      {categorias.length === 0 ? (
        <p className="text-sm text-content-muted">
          Ainda não há categorias. Elas separam {rotulo.plural} na lista e nos filtros — sem
          nenhuma, tudo funciona, só fica numa lista única.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line-subtle">
          {categorias.map((c) => (
            <Linha key={c.id} categoria={c} podeEditar={podeEditar} rotulo={rotulo} />
          ))}
        </ul>
      )}

      {podeEditar && (
        <form ref={formulario} action={criar} className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label htmlFor="nova-categoria">Nova categoria</Label>
              <Input
                id="nova-categoria"
                name="nome"
                required
                maxLength={60}
                placeholder="Bebidas geladas"
              />
            </div>
            <Submit variant="outline">
              <Plus aria-hidden />
              Adicionar
            </Submit>
          </div>
          {estado.erro !== null && <FormError>{estado.erro}</FormError>}
          {estado.ok !== null && <FormSuccess>{estado.ok}</FormSuccess>}
        </form>
      )}
    </div>
  );
}
