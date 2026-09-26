'use client';

import { formatCents, parseCents } from '@tivexy/core';
import { ShoppingCart } from 'lucide-react';
import { type KeyboardEvent, useActionState, useState } from 'react';

import { Field } from '@/components/form/field';
import { FormError } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { EmptyState } from '@/components/page/empty-state';
import { Button } from '@/components/ui/button';
import type { OpcaoDoCombobox } from '@/components/ui/combobox';
import { Textarea } from '@/components/ui/input';
import { TBody, TD, TFoot, TH, THead, TR, Table } from '@/components/ui/table';
import { contagem } from '@/lib/format';

import { registrarVenda } from './actions';
import { usePayments, useSaleLines } from './hooks';
import { PaymentSplit } from './payment-split';
import { ProductSearch, focarBusca } from './product-search';
import { QuickCustomer } from './quick-customer';
import { SaleLineItem } from './sale-line-item';
import { SaleTotals } from './sale-totals';
import {
  type FormaNaVenda,
  type Opcao,
  type ProdutoNaVenda,
  VENDA_INICIAL,
} from './state';

export interface SaleFormProps {
  produtos: readonly ProdutoNaVenda[];
  formas: readonly FormaNaVenda[];
  clientes: readonly Opcao[];
  exigeCliente: boolean;
  podeCadastrarCliente: boolean;
  /** Vocabulário do nicho, já resolvido: "venda", "cliente", "produto". */
  rotulos: { venda: string; cliente: string; produto: string };
}

const COLUNAS_DO_CARRINHO = 4;

/**
 * O balcão: montar a venda, cobrar, registrar.
 *
 * Este arquivo é só o maestro. Busca, linha do carrinho, cliente, pagamento e
 * totais são componentes irmãos; carrinho e caixa são os dois ganchos de
 * `hooks.ts`. Antes eram 658 linhas num corpo só, e mexer na coluna de itens
 * exigia reler todas elas.
 *
 * Feito para o leitor de código de barras e para o teclado: o foco começa na
 * busca; o leitor digita o código e manda Enter, e o produto entra. Enter na
 * quantidade volta para a busca — nunca registra.
 *
 * O preço mostrado é o do cadastro, e é o que vai valer: a Server Action e o
 * banco leem o preço de novo. Não existe campo de preço nesta tela.
 */
export function SaleForm({
  produtos,
  formas,
  clientes,
  exigeCliente,
  podeCadastrarCliente,
  rotulos,
}: SaleFormProps) {
  const [estado, acao] = useActionState(registrarVenda, VENDA_INICIAL);

  const carrinho = useSaleLines(produtos);
  const [desconto, setDesconto] = useState('');
  const [cliente, setCliente] = useState<OpcaoDoCombobox | null>(null);
  const [comObservacao, setComObservacao] = useState(false);
  const [aviso, setAviso] = useState('');

  const descontoCentavos = desconto.trim() === '' ? 0 : parseCents(desconto);
  const descontoInvalido =
    descontoCentavos === null || descontoCentavos > carrinho.subtotalCentavos;
  const total = carrinho.totalComDesconto(descontoCentavos ?? 0);
  const caixa = usePayments(formas, total);

  const erroDoDesconto =
    descontoInvalido && desconto.trim() !== ''
      ? descontoCentavos === null
        ? 'Valor inválido. Escreva como 1,50.'
        : 'Maior que o valor dos itens.'
      : undefined;

  const clienteOk = !exigeCliente || cliente !== null;
  const pronto = carrinho.completo && caixa.fechado && !descontoInvalido && clienteOk;

  /*
   * Por que o botão está travado, escrito onde o botão está.
   *
   * Antes o `disabled` era mudo: o motivo de uma quantidade inválida ficava
   * trezentas linhas acima, o de um pagamento que não bate ficava dentro do
   * fieldset, e quem olhava o rodapé não tinha como saber. A lista sai dos
   * mesmos predicados que travam o envio — não há um segundo julgamento aqui.
   */
  const pendencias: string[] = [];
  if (carrinho.vazio) pendencias.push(`Adicione ao menos um ${rotulos.produto}.`);
  else if (!carrinho.completo) {
    const quebradas = carrinho.itens.filter((i) => i.problema !== null || i.produto === undefined);
    pendencias.push(
      quebradas.length === 1
        ? `Confira a quantidade de ${quebradas[0]?.produto?.nome ?? 'um dos itens'}.`
        : `Confira a quantidade de ${quebradas.length} itens.`,
    );
  }
  if (descontoInvalido && desconto.trim() !== '') pendencias.push('Corrija o desconto.');
  if (!clienteOk) pendencias.push(`Escolha quem comprou — esta empresa exige identificar.`);
  if (!carrinho.vazio && caixa.diferencaCentavos > 0) {
    pendencias.push(`Faltam ${formatCents(caixa.diferencaCentavos)} nos pagamentos.`);
  }
  if (!carrinho.vazio && caixa.diferencaCentavos < 0) {
    pendencias.push(`Os pagamentos passam ${formatCents(-caixa.diferencaCentavos)} do total.`);
  }

  function adicionar(produto: ProdutoNaVenda) {
    const { chave, fracionada } = carrinho.adicionar(produto);
    setAviso(`${produto.nome} na venda.`);
    /*
     * Unidade entra com 1 e o foco volta para a busca — o próximo bipe. Peso se
     * digita, então o foco vai para a quantidade da linha. O quadro de espera é
     * necessário: a linha ainda não existe no DOM quando isto roda.
     */
    if (!fracionada) return;
    requestAnimationFrame(() => document.getElementById(`qtd-${chave}`)?.focus());
  }

  function tirar(chave: string) {
    const nome = carrinho.tirar(chave);
    setAviso(`${nome ?? 'Item'} saiu da venda.`);
    focarBusca();
  }

  /*
   * Enter nunca registra a venda.
   *
   * O balcão é operado com leitor de código de barras, que digita e manda Enter
   * sem que ninguém olhe para a tela. Com a submissão implícita do HTML, um
   * bipe a mais depois de o carrinho já fechar registraria a venda sozinho —
   * e o registro é irreversível por fora (baixa estoque, lança no caixa).
   * Registrar passa a ser só o botão, que é onde o `<Submit>` guarda a trava
   * contra o clique duplo.
   */
  function aoTeclarNoFormulario(evento: KeyboardEvent<HTMLFormElement>) {
    if (evento.key !== 'Enter') return;
    const alvo = evento.target;
    /* Quebra de linha na observação, e Enter no botão, que é o clique dele. */
    if (alvo instanceof HTMLTextAreaElement) return;
    if (alvo instanceof HTMLButtonElement || alvo instanceof HTMLAnchorElement) return;
    evento.preventDefault();
  }

  const campos = estado.campos;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
      <section aria-labelledby="titulo-itens" className="flex min-w-0 flex-col gap-4">
        <h2 id="titulo-itens" className="text-h2 text-content">
          Itens
        </h2>

        <ProductSearch
          produtos={produtos}
          rotuloProduto={rotulos.produto}
          aoAdicionar={adicionar}
        />

        {/*
         * O aviso do carrinho é falado E visível, no mesmo elemento: antes ia
         * só para um `sr-only`, e quem enxerga não recebia confirmação nenhuma
         * de que o bipe entrou. `min-h-5` reserva a linha para o aviso não
         * empurrar a tabela ao aparecer.
         */}
        <p role="status" aria-live="polite" className="-mt-2 min-h-5 text-caption text-content-muted">
          {aviso}
        </p>

        {campos.itens !== undefined && <FormError>{campos.itens}</FormError>}

        {carrinho.vazio ? (
          <EmptyState
            icone={ShoppingCart}
            titulo="Carrinho vazio"
            densidade="compacta"
            acao={
              <Button type="button" variant="outline" size="sm" onClick={focarBusca}>
                Ir para a busca
              </Button>
            }
          >
            Passe o leitor de código de barras ou escreva o nome do {rotulos.produto} no campo
            acima. Cada item entra com o preço do cadastro.
          </EmptyState>
        ) : (
          <Table densidade="densa" rotulo="Itens desta venda">
            <THead>
              <TR>
                <TH>{rotulos.produto}</TH>
                <TH alinhamento="fim">Quantidade</TH>
                <TH alinhamento="fim">Total</TH>
                <TH>
                  <span className="sr-only">Tirar da venda</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {carrinho.itens.map((item) => (
                <SaleLineItem
                  key={item.chave}
                  item={item}
                  aoMudarQuantidade={carrinho.mudarQuantidade}
                  aoPassar={carrinho.passo}
                  aoTirar={tirar}
                  aoVoltarParaBusca={focarBusca}
                />
              ))}
            </TBody>
            {/* Uma célula só com flex por dentro: no modo blocos do celular, rótulo e valor em células separadas viram duas linhas, e o subtotal deixa de se ler como subtotal. */}
            <TFoot>
              <TR>
                <TD colSpan={COLUNAS_DO_CARRINHO}>
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-label text-content-default">
                      {contagem(carrinho.itens.length, 'item', 'itens')}
                    </span>
                    <span className="text-num text-content">
                      {formatCents(carrinho.subtotalCentavos)}
                    </span>
                  </span>
                </TD>
              </TR>
            </TFoot>
          </Table>
        )}
      </section>

      {/*
       * O topo da coluna fixa sai do token do header, não de um número: o
       * `lg:top-20` de antes eram 80px inventados contra um header de 56px, e
       * mudar a altura do header deixava a coluna flutuando errada.
       *
       * `xl` e não `lg` na grade: a 1024px a sidebar do app entra e come 256px,
       * e sobravam 328px para a linha do item — onde precisam caber nome,
       * menos, quantidade, unidade, mais, total e lixeira.
       */}
      <form
        action={acao}
        onKeyDown={aoTeclarNoFormulario}
        aria-labelledby="titulo-fechamento"
        className="flex flex-col gap-4 rounded-card border border-line-subtle bg-surface-panel p-4 shadow-card xl:sticky xl:top-[calc(var(--header-h)_+_1.5rem)]"
      >
        {/* Itens e pagamentos são listas; o formulário só sabe mandar texto. */}
        <input type="hidden" name="itens" value={carrinho.json} />
        <input type="hidden" name="pagamentos" value={caixa.json} />

        <h2 id="titulo-fechamento" className="text-h2 text-content">
          Fechamento
        </h2>

        {estado.erro !== null && <FormError>{estado.erro}</FormError>}

        <QuickCustomer
          clientes={clientes}
          cliente={cliente}
          aoEscolher={setCliente}
          exige={exigeCliente}
          erro={campos.cliente}
          podeCadastrar={podeCadastrarCliente}
          rotulo={rotulos.cliente.charAt(0).toLocaleUpperCase('pt-BR') + rotulos.cliente.slice(1)}
        />

        <SaleTotals
          subtotalCentavos={carrinho.subtotalCentavos}
          totalCentavos={total}
          desconto={desconto}
          aoMudarDesconto={setDesconto}
          erroDoDesconto={campos.desconto ?? erroDoDesconto}
        />

        <PaymentSplit
          formas={formas}
          caixa={caixa}
          semItens={carrinho.vazio}
          erro={campos.pagamentos}
        />

        {comObservacao ? (
          <Field nome="observacao" rotulo="Observação" erro={campos.observacao}>
            <Textarea id="observacao" name="observacao" maxLength={500} size="sm" />
          </Field>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="self-start"
            onClick={() => setComObservacao(true)}
          >
            Adicionar observação
          </Button>
        )}

        {pendencias.length > 0 && (
          <div id="pendencias-da-venda" className="flex flex-col gap-1">
            <p className="text-caption text-content-muted">Falta para registrar:</p>
            <ul className="flex list-disc flex-col gap-0.5 pl-5 text-caption text-content-default">
              {pendencias.map((pendencia) => (
                <li key={pendencia}>{pendencia}</li>
              ))}
            </ul>
          </div>
        )}

        {/*
         * `Submit`, e não `Button type="submit"`: é ele que chama `useFormStatus`,
         * e é o `pending` daí que impede o clique duplo virar duas vendas no
         * caixa. O hook só enxerga o `<form>` de dentro dele — mover a chamada
         * para o `Button` devolveria `pending` sempre falso, sem erro nenhum
         * para avisar (risco R6 do DESIGN_SYSTEM).
         */}
        <Submit
          size="lg"
          disabled={!pronto}
          pendente="Registrando…"
          className="w-full"
          aria-describedby={pendencias.length > 0 ? 'pendencias-da-venda' : undefined}
        >
          {/* Carrinho vazio não anuncia "R$ 0,00" como se fosse um total legítimo. */}
          {carrinho.vazio
            ? `Adicione um ${rotulos.produto} para registrar`
            : `Registrar ${rotulos.venda} · ${formatCents(total)}`}
        </Submit>
      </form>
    </div>
  );
}
