'use client';

import { Check, FolderTree, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';

import { FormFeedback } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { TBody, TD, TH, THead, TR, Table, TableEmpty } from '@/components/ui/table';
import { contagem } from '@/lib/format';
import { capitalizar } from '@/lib/terms/vocabulary';
import { atrasoDaLinha } from '@/lib/utils';

import { ACAO_INICIAL } from '../state';
import { criarCategoria, excluirCategoria, renomearCategoria } from './actions';

export interface CategoriaNaTela {
  id: string;
  nome: string;
  produtos: number;
}

/** O vocabulário do tenant para o recurso "produto". Vem pronto do servidor. */
export interface RotuloDoRecurso {
  singular: string;
  plural: string;
}

function Linha({
  categoria,
  podeEditar,
  rotulo,
  indice,
}: {
  categoria: CategoriaNaTela;
  podeEditar: boolean;
  rotulo: RotuloDoRecurso;
  indice: number;
}) {
  const [renomeado, renomear] = useActionState(renomearCategoria, ACAO_INICIAL);
  const [excluido, excluir] = useActionState(excluirCategoria, ACAO_INICIAL);
  const [confirmando, setConfirmando] = useState(false);
  const { id, nome, produtos } = categoria;
  const quantos = contagem(produtos, rotulo.singular, rotulo.plural);

  /*
   * Zero não vira link: um filtro que já se sabe vazio é um clique que só
   * devolve o estado de "nada encontrado".
   */
  const uso =
    produtos === 0 ? (
      <span className="text-content-subtle">0</span>
    ) : (
      <Link
        href={`/erp/produtos?categoria=${id}&situacao=todos`}
        aria-label={`Ver os ${quantos} desta categoria`}
        className="inline-flex min-h-6 items-center text-content-accent underline-offset-4 transition-base hover:underline"
      >
        {produtos.toLocaleString('pt-BR')}
      </Link>
    );

  if (!podeEditar) {
    return (
      <TR className="animate-enter" style={{ animationDelay: atrasoDaLinha(indice) }}>
        <TD truncar className="w-full text-content">
          {nome}
        </TD>
        <TD numerico rotulo={capitalizar(rotulo.plural)}>
          {uso}
        </TD>
      </TR>
    );
  }

  return (
    <TR className="animate-enter" style={{ animationDelay: atrasoDaLinha(indice) }}>
      <TD className="w-full">
        {/* Renomear é um formulário por linha: o campo já é o valor atual, e salvar é o Enter. */}
        <form action={renomear} className="flex min-w-0 items-center gap-1.5">
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
            size="sm"
            className="max-w-xs"
          />
          <Submit
            variant="ghost"
            size="icon-sm"
            pendente=""
            aria-label={`Salvar o nome de ${nome}`}
          >
            <Check aria-hidden />
          </Submit>
        </form>
        <FormFeedback estado={renomeado} className="mt-1.5" />
        {/* O erro de apagar mora aqui porque o diálogo já fechou quando ele chega. */}
        <FormFeedback estado={excluido} className="mt-1.5" />
      </TD>

      <TD numerico rotulo={capitalizar(rotulo.plural)}>
        {uso}
      </TD>

      <TD acoes>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-haspopup="dialog"
          aria-label={`Apagar a categoria ${nome}`}
          onClick={() => setConfirmando(true)}
          className="text-danger hover:bg-danger-soft hover:text-danger"
        >
          <Trash2 aria-hidden />
        </Button>

        <AlertDialog
          aberto={confirmando}
          aoFechar={() => setConfirmando(false)}
          /* `warning`, não `danger`: nenhum cadastro se perde, só o agrupamento. */
          severidade="warning"
          titulo={`Apagar a categoria ${nome}?`}
          descricao={
            produtos === 0
              ? 'Ela não agrupa nada hoje, então nada muda de lugar.'
              : `${capitalizar(quantos)} ficam sem categoria. Nenhum cadastro é apagado.`
          }
          confirmarRotulo="Apagar categoria"
          confirmarAction={excluir}
        >
          <input type="hidden" name="id" value={id} />
        </AlertDialog>
      </TD>
    </TR>
  );
}

export interface CategoriesProps {
  categorias: readonly CategoriaNaTela[];
  podeEditar: boolean;
  rotulo: RotuloDoRecurso;
}

/**
 * As categorias, com quantos cadastros cada uma agrupa.
 *
 * Era um `<ul>` com o nome de um lado e a contagem do outro, sem cabeçalho e
 * sem alinhamento entre linhas. Em tabela a contagem vira coluna numérica —
 * dá para varrer de cima a baixo e ver qual categoria está vazia.
 *
 * A densidade é `larga` quando dá para editar porque a linha carrega um campo
 * de texto; sem permissão, a linha é só nome e número, e cabe em `densa`.
 */
export function Categories({ categorias, podeEditar, rotulo }: CategoriesProps) {
  const colunas = podeEditar ? 3 : 2;

  return (
    <Table densidade={podeEditar ? 'larga' : 'densa'} rotulo={`Categorias de ${rotulo.plural}`}>
      <THead sticky>
        <TR>
          <TH>Categoria</TH>
          <TH alinhamento="fim">{capitalizar(rotulo.plural)}</TH>
          {podeEditar && (
            <TH alinhamento="fim">
              <span className="sr-only">Ações</span>
            </TH>
          )}
        </TR>
      </THead>
      <TBody>
        {categorias.length === 0 ? (
          <TableEmpty colunas={colunas} icone={FolderTree} titulo="Ainda não há categorias">
            Elas separam {rotulo.plural} na lista e nos filtros. Sem nenhuma, tudo funciona — só
            fica numa lista única.
          </TableEmpty>
        ) : (
          categorias.map((c, i) => (
            <Linha key={c.id} categoria={c} podeEditar={podeEditar} rotulo={rotulo} indice={i} />
          ))
        )}
      </TBody>
    </Table>
  );
}

export interface NewCategoryFormProps {
  rotulo: RotuloDoRecurso;
  className?: string;
}

/** O cadastro de categoria. Fica ao lado da lista: a nova entra no fim dela, à vista. */
export function NewCategoryForm({ rotulo, className }: NewCategoryFormProps) {
  const [estado, criar] = useActionState(criarCategoria, ACAO_INICIAL);
  const formulario = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.ok !== null) formulario.current?.reset();
  }, [estado]);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Nova categoria</CardTitle>
        <CardDescription>Ela entra no fim da lista e já aparece no filtro.</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formulario} action={criar} className="flex flex-col gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="nova-categoria">Nome</Label>
            <Input
              id="nova-categoria"
              name="nome"
              required
              maxLength={60}
              autoComplete="off"
              placeholder={`Como ${rotulo.plural} se agrupam`}
            />
          </div>
          {/* A única ação `brand` desta tela: é o que se veio fazer aqui. */}
          <Submit>
            <Plus aria-hidden />
            Adicionar
          </Submit>
          <FormFeedback estado={estado} />
        </form>
      </CardContent>
    </Card>
  );
}
