'use client';

import { UNIT_INFO, grossMargin, isProductUnit, parseCents } from '@tivexy/core';
import { Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';

import { Field, describedBy } from '@/components/form/field';
import { FormError, FormSuccess } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { OPCOES_DE_UNIDADE, formatMargin } from '@/lib/erp/labels';

import { criarProduto, editarProduto } from './actions';
import { type Opcao, PRODUTO_INICIAL, type ProdutoFormState } from './state';

export interface ValoresDoProduto {
  id: string;
  nome: string;
  categoriaId: string | null;
  unidade: string;
  /** Já no formato de digitar: `1.234,56`. */
  preco: string;
  custo: string | null;
  sku: string | null;
  codigoDeBarras: string | null;
  controlaEstoque: boolean;
  /** Já no formato de digitar: `0,5`. */
  estoqueMinimo: string | null;
  descricao: string | null;
}

interface Props {
  singular: string;
  categorias: readonly Opcao[];
  /** O tenant tem o módulo de estoque: o interruptor e o mínimo aparecem. */
  comEstoque: boolean;
}

/**
 * O cadastro de produto, recolhido até ser pedido.
 *
 * Nome, unidade e preço bastam para vender. Custo, códigos e mínimo de
 * estoque são o que a loja vai preenchendo — exigir tudo na primeira vez faz
 * a pessoa inventar valores para conseguir salvar.
 */
export function NewProductForm(props: Props) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao] = useActionState(criarProduto, PRODUTO_INICIAL);
  const primeiro = useRef<HTMLInputElement>(null);

  // Depois de salvar, os campos remontam limpos (`key={estado.rodada}`) e o
  // foco volta ao nome: cadastrar o próximo é digitar de novo.
  useEffect(() => {
    if (estado.rodada > 0) primeiro.current?.focus();
  }, [estado.rodada]);

  if (!aberto) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setAberto(true)}>
          <Plus aria-hidden />
          Cadastrar {props.singular}
        </Button>
        {estado.salvo !== null && <FormSuccess>{`${estado.salvo} entrou na lista.`}</FormSuccess>}
      </div>
    );
  }

  return (
    <form
      action={acao}
      className="animate-enter rounded-lg border border-line-subtle bg-surface-raised p-4 shadow-xs"
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-medium text-content">Cadastrar {props.singular}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Fechar cadastro"
          onClick={() => setAberto(false)}
        >
          <X aria-hidden />
        </Button>
      </div>
      <Campos key={estado.rodada} {...props} estado={estado} primeiro={primeiro} />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Submit>Cadastrar</Submit>
        <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
        {estado.salvo !== null && <FormSuccess>{`${estado.salvo} entrou na lista.`}</FormSuccess>}
      </div>
    </form>
  );
}

export function EditProductForm(props: Props & { inicial: ValoresDoProduto }) {
  const [estado, acao] = useActionState(editarProduto, PRODUTO_INICIAL);

  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={props.inicial.id} />
      <Campos {...props} estado={estado} inicial={props.inicial} />
      <div className="flex flex-wrap items-center gap-3">
        <Submit>Salvar alterações</Submit>
        {estado.salvo !== null && <FormSuccess>Alterações salvas.</FormSuccess>}
      </div>
    </form>
  );
}

/** O campo de dinheiro: o símbolo fica fora do valor, que é o que se digita. */
function Dinheiro(props: React.ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <span
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-content-subtle"
        aria-hidden
      >
        R$
      </span>
      <Input inputMode="decimal" autoComplete="off" className="pl-9 tabular-nums" {...props} />
    </div>
  );
}

function Campos({
  categorias,
  comEstoque,
  estado,
  inicial,
  primeiro,
}: Props & {
  estado: ProdutoFormState;
  inicial?: ValoresDoProduto;
  primeiro?: React.RefObject<HTMLInputElement | null>;
}) {
  const e = estado.campos;
  const [unidade, setUnidade] = useState(inicial?.unidade ?? 'un');
  const [controla, setControla] = useState(inicial?.controlaEstoque ?? true);
  const [preco, setPreco] = useState(inicial?.preco ?? '');
  const [custo, setCusto] = useState(inicial?.custo ?? '');

  const fracionada = isProductUnit(unidade) && UNIT_INFO[unidade].fracionada;
  const precoCentavos = parseCents(preco);
  const custoCentavos = parseCents(custo);
  const margem =
    precoCentavos === null || custoCentavos === null
      ? null
      : grossMargin(precoCentavos, custoCentavos);
  const dicaCusto =
    margem === null
      ? 'Com o custo, a margem aparece aqui e na lista.'
      : `Margem sobre o preço: ${formatMargin(margem)}${margem < 0 ? ' — abaixo do custo.' : '.'}`;
  const dicaMinimo = `Chegando nele, o produto aparece como "no mínimo". ${
    fracionada ? 'Aceita fração: 0,5.' : 'Em número inteiro.'
  }`;

  return (
    <div className="flex flex-col gap-4">
      {estado.erro !== null && <FormError>{estado.erro}</FormError>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field nome="nome" rotulo="Nome" obrigatorio erro={e.nome} className="sm:col-span-2">
          <Input
            ref={primeiro}
            id="nome"
            name="nome"
            required
            maxLength={160}
            autoComplete="off"
            defaultValue={inicial?.nome}
            placeholder="Café coado 200 ml"
            aria-invalid={e.nome !== undefined}
            aria-describedby={describedBy('nome', e.nome)}
          />
        </Field>

        <Field nome="preco" rotulo="Preço de venda" obrigatorio erro={e.preco}>
          <Dinheiro
            id="preco"
            name="preco"
            required
            value={preco}
            onChange={(ev) => setPreco(ev.target.value)}
            placeholder="5,50"
            aria-invalid={e.preco !== undefined}
            aria-describedby={describedBy('preco', e.preco)}
          />
        </Field>

        <Field nome="custo" rotulo="Custo" erro={e.custo} dica={dicaCusto}>
          <Dinheiro
            id="custo"
            name="custo"
            value={custo}
            onChange={(ev) => setCusto(ev.target.value)}
            placeholder="1,80"
            aria-invalid={e.custo !== undefined}
            aria-describedby={describedBy('custo', e.custo, dicaCusto)}
          />
        </Field>

        <Field nome="unidade" rotulo="Unidade" obrigatorio erro={e.unidade}>
          <Select
            id="unidade"
            name="unidade"
            value={unidade}
            onChange={(ev) => setUnidade(ev.target.value)}
            aria-invalid={e.unidade !== undefined}
            aria-describedby={describedBy('unidade', e.unidade)}
          >
            {OPCOES_DE_UNIDADE.map((u) => (
              <option key={u.valor} value={u.valor}>
                {u.rotulo}
              </option>
            ))}
          </Select>
        </Field>

        <Field nome="categoria" rotulo="Categoria">
          <Select id="categoria" name="categoria" defaultValue={inicial?.categoriaId ?? ''}>
            <option value="">Sem categoria</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
          <Link
            href="/erp/produtos/categorias"
            className="text-xs text-content-accent hover:underline"
          >
            Criar ou renomear categorias
          </Link>
        </Field>

        <Field nome="sku" rotulo="Código interno" erro={e.sku}>
          <Input
            id="sku"
            name="sku"
            maxLength={60}
            autoComplete="off"
            defaultValue={inicial?.sku ?? ''}
            placeholder="CAF-200"
            className="font-mono"
            aria-invalid={e.sku !== undefined}
            aria-describedby={describedBy('sku', e.sku)}
          />
        </Field>

        <Field nome="codigoDeBarras" rotulo="Código de barras" erro={e.codigoDeBarras}>
          <Input
            id="codigoDeBarras"
            name="codigoDeBarras"
            maxLength={70}
            inputMode="numeric"
            autoComplete="off"
            defaultValue={inicial?.codigoDeBarras ?? ''}
            placeholder="7891234567890"
            className="font-mono"
            aria-invalid={e.codigoDeBarras !== undefined}
            aria-describedby={describedBy('codigoDeBarras', e.codigoDeBarras)}
          />
        </Field>

        {comEstoque && (
          <div className="flex flex-col gap-3 rounded-md border border-line-subtle p-3 sm:col-span-2">
            <input type="hidden" name="controlaEstoqueNaTela" value="1" />
            <label className="flex items-start gap-3">
              <Switch
                name="controlaEstoque"
                checked={controla}
                onChange={(ev) => setControla(ev.target.checked)}
                aria-describedby="controla-dica"
                className="mt-0.5"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-content-default">Controla estoque</span>
                <span id="controla-dica" className="text-xs text-content-subtle">
                  Desligado para serviço ou item preparado na hora: a venda não baixa nada.
                </span>
              </span>
            </label>
            {controla && (
              <Field
                nome="estoqueMinimo"
                rotulo={`Estoque mínimo (${unidade})`}
                erro={e.estoqueMinimo}
                dica={dicaMinimo}
              >
                <Input
                  id="estoqueMinimo"
                  name="estoqueMinimo"
                  inputMode="decimal"
                  autoComplete="off"
                  defaultValue={inicial?.estoqueMinimo ?? ''}
                  placeholder={fracionada ? '2,5' : '10'}
                  className="tabular-nums sm:max-w-40"
                  aria-invalid={e.estoqueMinimo !== undefined}
                  aria-describedby={describedBy('estoqueMinimo', e.estoqueMinimo, dicaMinimo)}
                />
              </Field>
            )}
          </div>
        )}

        <Field nome="descricao" rotulo="Descrição" erro={e.descricao} className="sm:col-span-2">
          <Textarea
            id="descricao"
            name="descricao"
            maxLength={2000}
            defaultValue={inicial?.descricao ?? ''}
            aria-invalid={e.descricao !== undefined}
            aria-describedby={describedBy('descricao', e.descricao)}
          />
        </Field>
      </div>
    </div>
  );
}
