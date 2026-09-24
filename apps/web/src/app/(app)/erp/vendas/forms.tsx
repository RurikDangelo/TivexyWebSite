'use client';

import { AlertTriangle, CheckCircle2, Loader2, Plus, Trash2 } from 'lucide-react';
import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { formatCents, lineTotalCents, parseCents, parseQuantity } from '@tivexy/core';
import { Button } from '@/components/ui/button';
import { Campo, CampoSelecao, type Opcao } from '@/components/ui/field';

import { abrirVenda, adicionarItem, confirmarVenda, registrarPagamento } from './actions';
import {
  CONFIRMAR_INICIAL,
  ITEM_INICIAL,
  NOVA_VENDA_INICIAL,
  PAGAMENTO_INICIAL,
  type ProdutoDeVenda,
} from './state';

function Enviar({ rotulo, variante }: { rotulo: string; variante?: 'outline' | 'danger' }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variante} disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Aguarde…
        </>
      ) : (
        rotulo
      )}
    </Button>
  );
}

/* ── Abrir rascunho ────────────────────────────────────────────────────── */

export function NovaVenda({
  clientes,
  exigeCliente,
}: {
  clientes: readonly Opcao[];
  exigeCliente: boolean;
}) {
  const [estado, acao] = useActionState(abrirVenda, NOVA_VENDA_INICIAL);
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <Button onClick={() => setAberto(true)}>
        <Plus aria-hidden />
        Nova venda
      </Button>
    );
  }

  return (
    <form action={acao} className="rounded-lg border border-line-subtle bg-surface-raised p-4">
      <h2 className="mb-4 font-medium text-content">Nova venda</h2>

      {estado.erro !== null && (
        <p role="alert" className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {estado.erro}
        </p>
      )}

      {clientes.length > 0 ? (
        <CampoSelecao
          nome="company_id"
          rotulo="Cliente"
          obrigatorio={exigeCliente}
          vazio={exigeCliente ? undefined : 'Balcão — sem identificar'}
          opcoes={clientes}
          dica={
            exigeCliente
              ? 'Esta empresa exige identificar quem comprou. Muda em Configurações.'
              : 'Vem do CRM. Não há cadastro de cliente separado no ERP.'
          }
        />
      ) : (
        <p className="mb-4 rounded-md bg-surface-subtle px-3 py-2 text-sm text-content-muted">
          Nenhuma empresa cadastrada no CRM ainda. A venda abre sem cliente.
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Enviar rotulo="Abrir" />
        <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/* ── Acrescentar item ──────────────────────────────────────────────────── */

/**
 * O item, com o total da linha calculado enquanto a pessoa digita.
 *
 * A conta é `lineTotalCents`, do Core — **a mesma que o gatilho do banco
 * faz**. Uma segunda fórmula aqui daria o mesmo número quase sempre, e "quase
 * sempre" em cima de dinheiro é o que produz o centavo que ninguém explica.
 *
 * O preço em branco herda o do cadastro, e a prévia mostra isso. Quem herda
 * de verdade é o **servidor**: mandar o valor herdado num campo escondido
 * faria o preço da venda vir do navegador, e quem editasse o campo venderia
 * pelo valor que quisesse. Aqui a prévia é informação; a gravação lê a tabela.
 */
export function AdicionarItem({
  vendaId,
  produtos,
}: {
  vendaId: string;
  produtos: readonly ProdutoDeVenda[];
}) {
  const [estado, acao] = useActionState(adicionarItem, ITEM_INICIAL);
  const [produtoId, setProdutoId] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [preco, setPreco] = useState('');
  const primeiro = useRef<HTMLSelectElement>(null);

  const escolhido = produtos.find((p) => p.id === produtoId) ?? null;

  /* Preço em branco herda o do produto — é o caso comum, e digitar de novo o
     que já está cadastrado é atrito puro. */
  const precoEfetivo = preco === '' ? (escolhido?.priceCents ?? null) : parseCents(preco);
  const qtd = parseQuantity(quantidade);
  const previa = precoEfetivo !== null && qtd !== null ? lineTotalCents(qtd, precoEfetivo) : null;

  if (produtos.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line-subtle px-4 py-6 text-center text-sm text-content-muted">
        Cadastre um produto ativo antes de montar a venda.
      </p>
    );
  }

  return (
    <form action={acao} className="rounded-lg border border-line-subtle p-3">
      <input type="hidden" name="venda" value={vendaId} />

      {estado.erro !== null && (
        <p role="alert" className="mb-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {estado.erro}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
        <CampoSelecao
          nome="product_id"
          rotulo="Produto"
          obrigatorio
          vazio="Escolha…"
          erro={estado.campos.product_id}
          opcoes={produtos.map((p) => ({
            valor: p.id,
            texto: `${p.nome} — ${formatCents(p.priceCents)}/${p.unit}`,
          }))}
          referenciaSelect={primeiro}
          aoMudar={(valor) => {
            setProdutoId(valor);
            /* Trocar de produto limpa o preço digitado: manter o preço do
               item anterior é o engano que ninguém percebe. */
            setPreco('');
          }}
        />
        <Campo
          nome="quantity"
          rotulo="Quantidade"
          obrigatorio
          padrao="1"
          erro={estado.campos.quantity}
          aoMudar={setQuantidade}
        />
        <Campo
          nome="unit_price_cents"
          rotulo="Preço unitário"
          erro={estado.campos.unit_price_cents}
          placeholder={escolhido === null ? '0,00' : formatCents(escolhido.priceCents)}
          padrao=""
          aoMudar={setPreco}
          dica="Em branco usa o do cadastro."
        />
        <Enviar rotulo="Somar" variante="outline" />
      </div>

      {/*
        A prévia é `aria-live`: quem usa leitor de tela precisa ouvir o total
        mudar, senão o número só existe para quem enxerga.
      */}
      <p aria-live="polite" className="mt-2 text-sm text-content-muted">
        {previa === null ? (
          'Escolha o produto e a quantidade.'
        ) : (
          <>
            Total da linha:{' '}
            <strong className="font-mono text-content">{formatCents(previa)}</strong>
          </>
        )}
      </p>
    </form>
  );
}

/* ── Confirmar ─────────────────────────────────────────────────────────── */

export function ConfirmarVenda({ vendaId, temItens }: { vendaId: string; temItens: boolean }) {
  const [estado, acao] = useActionState(confirmarVenda, CONFIRMAR_INICIAL);

  return (
    <form action={acao} className="flex flex-col gap-3">
      <input type="hidden" name="venda" value={vendaId} />

      {estado.erro !== null && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {estado.erro}
        </p>
      )}
      {estado.numero !== null && (
        <p role="status" className="flex items-center gap-1.5 text-sm text-success">
          <CheckCircle2 className="size-4" aria-hidden />
          Confirmada como venda #{estado.numero}.
        </p>
      )}

      <div>
        <Enviar rotulo="Confirmar venda" />
      </div>

      <p className="text-xs text-content-subtle">
        {temItens
          ? 'Confirmar atribui o número, baixa o estoque dos itens que controlam, e gera o recebimento — tudo numa transação só.'
          : 'Some pelo menos um item antes de confirmar.'}
      </p>
    </form>
  );
}

/* ── Pagamento ─────────────────────────────────────────────────────────── */

export function RegistrarPagamento({
  vendaId,
  formas,
  restanteCents,
}: {
  vendaId: string;
  formas: readonly Opcao[];
  restanteCents: number;
}) {
  const [estado, acao] = useActionState(registrarPagamento, PAGAMENTO_INICIAL);

  if (formas.length === 0) {
    return (
      <p className="text-sm text-content-muted">
        Nenhuma forma de pagamento cadastrada. Elas vêm do nicho, no provisionamento.
      </p>
    );
  }

  return (
    <form action={acao} className="flex flex-col gap-3">
      <input type="hidden" name="venda" value={vendaId} />

      {estado.erro !== null && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {estado.erro}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <CampoSelecao
          nome="payment_method_id"
          rotulo="Forma"
          obrigatorio
          vazio="Escolha…"
          opcoes={formas}
        />
        <Campo
          nome="amount_cents"
          rotulo="Valor"
          obrigatorio
          padrao={restanteCents > 0 ? (restanteCents / 100).toFixed(2).replace('.', ',') : ''}
        />
        <Enviar rotulo="Registrar" variante="outline" />
      </div>

      <p className="flex items-start gap-1.5 text-xs text-warning">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          Isto <strong>registra</strong> como o cliente disse que pagou. Não cobra cartão, não gera
          boleto e não fala com banco — o Tivexy não tem integração de pagamento.
        </span>
      </p>
    </form>
  );
}

/** O ícone de remover item, num `form` — remover por GET seria pré-carregado. */
export function Remover({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="Remover item"
      className="flex size-8 items-center justify-center rounded-md text-content-subtle transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
    >
      {children ?? <Trash2 className="size-4" aria-hidden />}
    </button>
  );
}
