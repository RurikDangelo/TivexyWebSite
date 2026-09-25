'use client';

import { ArrowDownLeft, ArrowUpRight, type LucideIcon, Plus, Scale, X } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';

import { Field, describedBy } from '@/components/form/field';
import { FormError, FormSuccess } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import type { TipoAMao } from '@/lib/erp/movement-input';
import { cn } from '@/lib/utils';

import { registrarMovimento } from './actions';
import { MOVIMENTO_INICIAL, type MovimentoFormState, type ProdutoParaMovimentar } from './state';

const TIPOS: readonly {
  valor: TipoAMao;
  rotulo: string;
  Icone: LucideIcon;
  quantidade: string;
  motivo: string;
}[] = [
  {
    valor: 'in',
    rotulo: 'Entrada',
    Icone: ArrowDownLeft,
    quantidade: 'Quanto entrou',
    motivo: 'Nota 4512 — Distribuidora Central',
  },
  {
    valor: 'out',
    rotulo: 'Saída',
    Icone: ArrowUpRight,
    quantidade: 'Quanto saiu',
    motivo: 'Quebra, perda, validade, consumo',
  },
  {
    valor: 'adjustment',
    rotulo: 'Contagem',
    Icone: Scale,
    quantidade: 'Quanto foi contado',
    motivo: 'Inventário do mês',
  },
];

interface Props {
  produtos: readonly ProdutoParaMovimentar[];
  /** "Insumo", "Item de estoque" — o nome do nicho, já com maiúscula. */
  rotuloProduto: string;
  /** Vindo do botão de uma linha: o painel já abre com o produto escolhido. */
  produtoInicial: string | null;
  tipoInicial: TipoAMao;
}

/**
 * Entrada, saída e contagem — um formulário só, que muda com o tipo.
 *
 * Contagem pede o que foi contado, não a diferença: quem está na prateleira
 * sabe quantos tem, e fazer a conta de cabeça é onde o erro entra. O banco
 * calcula a diferença contra o saldo daquele instante.
 */
export function MovementForm(props: Props) {
  const [aberto, setAberto] = useState(props.produtoInicial !== null);
  const [estado, acao] = useActionState(registrarMovimento, MOVIMENTO_INICIAL);

  if (!aberto) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setAberto(true)}>
          <Plus aria-hidden />
          Registrar movimentação
        </Button>
        {estado.ok !== null && <FormSuccess>{estado.ok}</FormSuccess>}
      </div>
    );
  }

  return (
    <form
      id="registrar"
      action={acao}
      className="animate-enter rounded-lg border border-line-subtle bg-surface-raised p-4 shadow-xs"
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-medium text-content">Registrar movimentação</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Fechar"
          onClick={() => setAberto(false)}
        >
          <X aria-hidden />
        </Button>
      </div>
      <Campos key={estado.rodada} {...props} estado={estado} />
    </form>
  );
}

function Campos({
  produtos,
  rotuloProduto,
  produtoInicial,
  tipoInicial,
  estado,
}: Props & { estado: MovimentoFormState }) {
  const e = estado.campos;
  const [produtoId, setProdutoId] = useState(produtoInicial ?? '');
  const [tipo, setTipo] = useState<TipoAMao>(tipoInicial);
  const quantidadeRef = useRef<HTMLInputElement>(null);

  // Depois de registrar, o foco volta para a quantidade: numa entrega com
  // dez produtos, é escolher o próximo e digitar.
  useEffect(() => {
    if (estado.rodada > 0) quantidadeRef.current?.focus();
  }, [estado.rodada]);

  const unidade = produtos.find((p) => p.id === produtoId)?.unidade ?? null;
  const atual = TIPOS.find((t) => t.valor === tipo) ?? TIPOS[0]!;
  const sufixo = unidade === null ? '' : ` (${unidade})`;
  const dicaQuantidade =
    tipo === 'adjustment'
      ? 'O que tem na prateleira agora. O sistema calcula a diferença.'
      : undefined;

  return (
    <div className="flex flex-col gap-4">
      {estado.erro !== null && <FormError>{estado.erro}</FormError>}

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium text-content-default">Tipo</legend>
        <div className="grid grid-cols-3 gap-2">
          {TIPOS.map(({ valor, rotulo, Icone }) => (
            <label
              key={valor}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-sm transition-colors',
                // O rádio é invisível; o foco aparece no cartão que o contém.
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                tipo === valor
                  ? 'border-line-accent bg-surface-accent-soft font-medium text-content-accent'
                  : 'border-line-field text-content-default hover:bg-surface-subtle',
              )}
            >
              <input
                type="radio"
                name="tipo"
                value={valor}
                checked={tipo === valor}
                onChange={() => setTipo(valor)}
                className="sr-only"
              />
              <Icone className="size-4" aria-hidden />
              {rotulo}
            </label>
          ))}
        </div>
        {e.tipo !== undefined && (
          <p role="alert" className="text-xs text-danger">
            {e.tipo}
          </p>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field nome="produto" rotulo={rotuloProduto} obrigatorio erro={e.produto}>
          <Select
            id="produto"
            name="produto"
            required
            value={produtoId}
            onChange={(ev) => setProdutoId(ev.target.value)}
            aria-invalid={e.produto !== undefined}
            aria-describedby={describedBy('produto', e.produto)}
          >
            <option value="" disabled>
              Escolha…
            </option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} ({p.unidade})
              </option>
            ))}
          </Select>
        </Field>

        <Field
          nome="quantidade"
          rotulo={`${atual.quantidade}${sufixo}`}
          obrigatorio
          erro={e.quantidade}
          dica={dicaQuantidade}
        >
          <Input
            ref={quantidadeRef}
            id="quantidade"
            name="quantidade"
            required
            inputMode="decimal"
            autoComplete="off"
            placeholder={tipo === 'adjustment' ? '17' : '5'}
            className="tabular-nums"
            aria-invalid={e.quantidade !== undefined}
            aria-describedby={describedBy('quantidade', e.quantidade, dicaQuantidade)}
          />
        </Field>

        {tipo === 'in' && (
          <Field
            nome="custo"
            rotulo={`Custo por ${unidade ?? 'unidade'}`}
            erro={e.custo}
            dica="Fica registrado na entrada."
          >
            <div className="relative">
              <span
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-content-subtle"
                aria-hidden
              >
                R$
              </span>
              <Input
                id="custo"
                name="custo"
                inputMode="decimal"
                autoComplete="off"
                placeholder="3,50"
                className="pl-9 tabular-nums"
                aria-invalid={e.custo !== undefined}
                aria-describedby={describedBy('custo', e.custo, 'Fica registrado na entrada.')}
              />
            </div>
          </Field>
        )}

        <Field
          nome="motivo"
          rotulo="Motivo"
          obrigatorio={tipo === 'out'}
          erro={e.motivo}
          className={tipo === 'in' ? '' : 'sm:col-span-2'}
        >
          <Input
            id="motivo"
            name="motivo"
            required={tipo === 'out'}
            maxLength={200}
            autoComplete="off"
            placeholder={atual.motivo}
            aria-invalid={e.motivo !== undefined}
            aria-describedby={describedBy('motivo', e.motivo)}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Submit pendente="Registrando…">Registrar {atual.rotulo.toLowerCase()}</Submit>
        {estado.ok !== null && <FormSuccess>{estado.ok}</FormSuccess>}
      </div>
    </div>
  );
}
