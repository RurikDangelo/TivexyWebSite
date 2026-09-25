'use client';

import {
  UNIT_INFO,
  checkQuantity,
  formatCents,
  formatCentsInput,
  isProductUnit,
  lineTotalCents,
  parseCents,
  parseQuantity,
  saleTotals,
} from '@tivexy/core';
import { Minus, Plus, ScanBarcode, Trash2, UserPlus, X } from 'lucide-react';
import { useActionState, useMemo, useRef, useState, useTransition } from 'react';

import { Field, describedBy } from '@/components/form/field';
import { FormError } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { criarClienteRapido, registrarVenda } from './actions';
import {
  CLIENTE_INICIAL,
  type ClienteRapidoState,
  type FormaNaVenda,
  type Opcao,
  type ProdutoNaVenda,
  VENDA_INICIAL,
} from './state';

interface Props {
  produtos: readonly ProdutoNaVenda[];
  formas: readonly FormaNaVenda[];
  clientes: readonly Opcao[];
  exigeCliente: boolean;
  podeCadastrarCliente: boolean;
  /** Vocabulário do nicho, já resolvido: "venda", "cliente", "produto". */
  rotulos: { venda: string; cliente: string; produto: string; produtos: string };
}

interface Linha {
  chave: string;
  produtoId: string;
  quantidade: string;
}

interface Pagamento {
  chave: string;
  formaId: string;
  valor: string;
  /** Só para dinheiro: quanto o cliente entregou, para calcular o troco. */
  recebido: string;
}

/** "acucar" acha "Açúcar". */
function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

let sequencia = 0;
const novaChave = () => `k${++sequencia}`;

/**
 * O balcão: montar a venda, cobrar, registrar.
 *
 * Feito para o leitor de código de barras e para o teclado: o foco começa na
 * busca; o leitor digita o código e manda Enter, e o produto entra. Enter na
 * quantidade volta para a busca em vez de enviar a venda pela metade.
 *
 * O preço mostrado é o do cadastro — e é o que vai valer: a ação e o banco
 * leem o preço de novo. Desconto é da venda inteira, e fica registrado.
 */
export function SaleForm(props: Props) {
  const { produtos, formas, exigeCliente, podeCadastrarCliente, rotulos } = props;
  const [estado, acao] = useActionState(registrarVenda, VENDA_INICIAL);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [busca, setBusca] = useState('');
  const [aviso, setAviso] = useState('');
  const [desconto, setDesconto] = useState('');
  const [clientes, setClientes] = useState<readonly Opcao[]>(props.clientes);
  const [clienteId, setClienteId] = useState('');
  const [pagamentos, setPagamentos] = useState<Pagamento[]>(() => [
    { chave: novaChave(), formaId: formas[0]?.id ?? '', valor: '', recebido: '' },
  ]);
  const [valorEditado, setValorEditado] = useState(false);
  const [comObservacao, setComObservacao] = useState(false);
  const buscaRef = useRef<HTMLInputElement>(null);

  const porId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  const formaPorId = useMemo(() => new Map(formas.map((f) => [f.id, f])), [formas]);

  /* ── Itens ────────────────────────────────────────────────────────── */

  const termo = semAcento(busca.trim());
  const resultados =
    termo === ''
      ? []
      : produtos
          .filter(
            (p) =>
              semAcento(p.nome).includes(termo) ||
              (p.sku !== null && semAcento(p.sku) === termo) ||
              p.codigoDeBarras === busca.trim(),
          )
          .slice(0, 8);

  function adicionar(produto: ProdutoNaVenda) {
    const unidade = isProductUnit(produto.unidade) ? produto.unidade : 'un';
    const fracionada = UNIT_INFO[unidade].fracionada;
    const existente = linhas.find((l) => l.produtoId === produto.id);
    const chave = existente?.chave ?? novaChave();

    if (existente === undefined) {
      setLinhas([...linhas, { chave, produtoId: produto.id, quantidade: fracionada ? '' : '1' }]);
    } else if (!fracionada) {
      setLinhas(
        linhas.map((l) =>
          l.chave === chave
            ? { ...l, quantidade: String((parseQuantity(l.quantidade) ?? 0) + 1) }
            : l,
        ),
      );
    }
    setAviso(`${produto.nome} na venda.`);
    setBusca('');

    // Unidade entra com 1 e o foco volta para a busca — o próximo bipe.
    // Peso se digita: o foco vai para a quantidade da linha.
    requestAnimationFrame(() => {
      if (fracionada) document.getElementById(`qtd-${chave}`)?.focus();
      else buscaRef.current?.focus();
    });
  }

  function aoTeclarNaBusca(ev: React.KeyboardEvent<HTMLInputElement>) {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const exato = produtos.find(
      (p) => p.codigoDeBarras === busca.trim() || (p.sku !== null && semAcento(p.sku) === termo),
    );
    const escolhido = exato ?? resultados[0];
    if (escolhido !== undefined) adicionar(escolhido);
    else if (termo !== '') setAviso(`Nada no cadastro com “${busca.trim()}”.`);
  }

  function mudarQuantidade(chave: string, quantidade: string) {
    setLinhas(linhas.map((l) => (l.chave === chave ? { ...l, quantidade } : l)));
  }

  function passo(chave: string, delta: number) {
    setLinhas(
      linhas.map((l) => {
        if (l.chave !== chave) return l;
        const atual = parseQuantity(l.quantidade) ?? 0;
        return { ...l, quantidade: String(Math.max(1, atual + delta)) };
      }),
    );
  }

  function tirar(chave: string) {
    const linha = linhas.find((l) => l.chave === chave);
    setLinhas(linhas.filter((l) => l.chave !== chave));
    if (linha !== undefined)
      setAviso(`${porId.get(linha.produtoId)?.nome ?? 'Item'} saiu da venda.`);
    buscaRef.current?.focus();
  }

  const itens = linhas.map((l) => {
    const produto = porId.get(l.produtoId);
    const unidade =
      produto !== undefined && isProductUnit(produto.unidade) ? produto.unidade : 'un';
    const quantidade = parseQuantity(l.quantidade);
    const problema =
      l.quantidade.trim() === ''
        ? 'Quanto?'
        : quantidade === null
          ? 'Quantidade inválida'
          : checkQuantity(quantidade, unidade);
    return {
      linha: l,
      produto,
      unidade,
      quantidade: problema === null ? quantidade : null,
      problema,
    };
  });

  /* ── Totais e pagamento ───────────────────────────────────────────── */

  const descontoCentavos = desconto.trim() === '' ? 0 : parseCents(desconto);
  const { subtotal, total } = saleTotals(
    itens.map((i) => ({
      quantidade: i.quantidade ?? 0,
      precoCentavos: i.produto?.precoCentavos ?? 0,
    })),
    descontoCentavos ?? 0,
  );
  const descontoInvalido = descontoCentavos === null || (descontoCentavos ?? 0) > subtotal;
  const erroDoDesconto =
    descontoInvalido && desconto.trim() !== ''
      ? descontoCentavos === null
        ? 'Valor inválido. Escreva como 1,50.'
        : 'Maior que o valor dos itens.'
      : undefined;

  /** O pagamento único acompanha o total até alguém mexer nele. */
  const valorDe = (i: number): string =>
    pagamentos.length === 1 && !valorEditado
      ? total > 0
        ? formatCentsInput(total)
        : ''
      : (pagamentos[i]?.valor ?? '');

  const pago = pagamentos.reduce((soma, _p, i) => soma + (parseCents(valorDe(i)) ?? 0), 0);
  const diferenca = total - pago;
  const itensOk =
    itens.length > 0 && itens.every((i) => i.problema === null && i.produto !== undefined);
  const pagamentosOk =
    diferenca === 0 && pagamentos.every((p, i) => valorDe(i) === '' || p.formaId !== '');
  const clienteOk = !exigeCliente || clienteId !== '';
  const pronto = itensOk && pagamentosOk && !descontoInvalido && clienteOk;

  function mudarPagamento(chave: string, parte: Partial<Pagamento>) {
    setPagamentos(pagamentos.map((p) => (p.chave === chave ? { ...p, ...parte } : p)));
  }

  function dividir() {
    // Quem divide assume os valores: o primeiro fica com o que já mostrava.
    const primeiro = pagamentos.map((p, i) => ({ ...p, valor: valorDe(i) }));
    setPagamentos([
      ...primeiro,
      {
        chave: novaChave(),
        formaId: formas[1]?.id ?? formas[0]?.id ?? '',
        valor: '',
        recebido: '',
      },
    ]);
    setValorEditado(true);
  }

  function tirarPagamento(chave: string) {
    const restantes = pagamentos.filter((p) => p.chave !== chave);
    setPagamentos(restantes);
    if (restantes.length === 1) setValorEditado(false);
  }

  const itensJson = JSON.stringify(
    linhas.map((l) => ({ produto: l.produtoId, quantidade: l.quantidade })),
  );
  const pagamentosJson = JSON.stringify(
    pagamentos
      .map((p, i) => ({ forma: p.formaId, valor: valorDe(i) }))
      .filter((p) => p.valor !== '' && (parseCents(p.valor) ?? 0) > 0),
  );

  /* ── Cliente ──────────────────────────────────────────────────────── */

  const [cadastrando, setCadastrando] = useState(false);
  const [estadoCliente, setEstadoCliente] = useState<ClienteRapidoState>(CLIENTE_INICIAL);
  const [salvandoCliente, iniciar] = useTransition();
  const nomeClienteRef = useRef<HTMLInputElement>(null);
  const docClienteRef = useRef<HTMLInputElement>(null);

  function cadastrarCliente() {
    const fd = new FormData();
    fd.set('nome', nomeClienteRef.current?.value ?? '');
    fd.set('documento', docClienteRef.current?.value ?? '');
    iniciar(async () => {
      const r = await criarClienteRapido(CLIENTE_INICIAL, fd);
      setEstadoCliente(r);
      if (r.cliente !== null) {
        const novo = r.cliente;
        setClientes((lista) =>
          [...lista, novo].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
        );
        setClienteId(novo.id);
        setCadastrando(false);
      }
    });
  }

  const e = estado.campos;
  const venda = rotulos.venda;

  return (
    <form action={acao} className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
      <input type="hidden" name="itens" value={itensJson} />
      <input type="hidden" name="pagamentos" value={pagamentosJson} />
      <p className="sr-only" aria-live="polite">
        {aviso}
      </p>

      {/* ── Coluna dos itens ── */}
      <section aria-labelledby="titulo-itens" className="flex min-w-0 flex-col gap-4">
        <h2 id="titulo-itens" className="sr-only">
          Itens
        </h2>
        <div className="relative">
          <Label htmlFor="busca" className="mb-1.5 block">
            Adicionar {rotulos.produto}
          </Label>
          <div className="relative">
            <ScanBarcode
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-content-subtle"
              aria-hidden
            />
            <Input
              ref={buscaRef}
              id="busca"
              type="search"
              autoFocus
              autoComplete="off"
              value={busca}
              onChange={(ev) => setBusca(ev.target.value)}
              onKeyDown={aoTeclarNaBusca}
              placeholder="Nome, código ou leitor de código de barras"
              className="h-11 pl-9 text-base"
              aria-describedby="busca-dica"
            />
          </div>
          <p id="busca-dica" className="mt-1 text-xs text-content-subtle">
            Enter adiciona o primeiro da lista — ou o código exato.
          </p>
          {resultados.length > 0 && (
            <ul className="mt-2 overflow-hidden rounded-md border border-line-subtle bg-surface-raised shadow-xs">
              {resultados.map((p) => (
                <li key={p.id} className="border-b border-line-subtle last:border-b-0">
                  <button
                    type="button"
                    onClick={() => adicionar(p)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-surface-subtle focus-visible:bg-surface-subtle"
                  >
                    <span className="min-w-0 truncate text-content">{p.nome}</span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-content-muted">
                      {formatCents(p.precoCentavos)}/{p.unidade}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {termo !== '' && resultados.length === 0 && (
            <p className="mt-2 text-sm text-content-muted">
              Nada no cadastro com &ldquo;{busca.trim()}&rdquo;.
            </p>
          )}
        </div>

        {e.itens !== undefined && <FormError>{e.itens}</FormError>}

        {linhas.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-content-muted">
            Nenhum {rotulos.produto} ainda. Busque pelo nome ou passe o leitor.
          </div>
        ) : (
          <ul className="overflow-hidden rounded-lg border border-line-subtle bg-surface-raised">
            {itens.map(({ linha, produto, unidade, quantidade, problema }) => {
              const fracionada = UNIT_INFO[unidade].fracionada;
              const totalDaLinha =
                quantidade === null || produto === undefined
                  ? null
                  : lineTotalCents(quantidade, produto.precoCentavos);
              return (
                <li
                  key={linha.chave}
                  className="animate-enter flex flex-col gap-2 border-b border-line-subtle p-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-content">{produto?.nome ?? '—'}</p>
                    <p className="font-mono text-xs tabular-nums text-content-muted">
                      {produto === undefined
                        ? ''
                        : `${formatCents(produto.precoCentavos)} / ${unidade}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!fracionada && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-8"
                        aria-label={`Um a menos de ${produto?.nome ?? 'item'}`}
                        onClick={() => passo(linha.chave, -1)}
                      >
                        <Minus aria-hidden />
                      </Button>
                    )}
                    <Label htmlFor={`qtd-${linha.chave}`} className="sr-only">
                      Quantidade de {produto?.nome}
                    </Label>
                    <Input
                      id={`qtd-${linha.chave}`}
                      data-quantidade
                      inputMode="decimal"
                      autoComplete="off"
                      value={linha.quantidade}
                      onChange={(ev) => mudarQuantidade(linha.chave, ev.target.value)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') {
                          ev.preventDefault();
                          buscaRef.current?.focus();
                        }
                      }}
                      placeholder={fracionada ? '0,350' : '1'}
                      className="h-8 w-20 text-center tabular-nums"
                      aria-invalid={problema !== null}
                      aria-describedby={problema === null ? undefined : `qtd-${linha.chave}-erro`}
                    />
                    <span className="w-6 text-xs text-content-muted">{unidade}</span>
                    {!fracionada && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-8"
                        aria-label={`Um a mais de ${produto?.nome ?? 'item'}`}
                        onClick={() => passo(linha.chave, 1)}
                      >
                        <Plus aria-hidden />
                      </Button>
                    )}
                    <span className="ml-auto w-24 text-right font-mono text-sm font-medium tabular-nums text-content sm:ml-0">
                      {totalDaLinha === null ? '—' : formatCents(totalDaLinha)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Tirar ${produto?.nome ?? 'item'} da venda`}
                      onClick={() => tirar(linha.chave)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                  {problema !== null && linha.quantidade.trim() !== '' && (
                    <p
                      id={`qtd-${linha.chave}-erro`}
                      role="alert"
                      className="text-xs text-danger sm:basis-full"
                    >
                      {problema}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Coluna do fechamento ── */}
      <section
        aria-labelledby="titulo-fechamento"
        className="flex flex-col gap-4 rounded-lg border border-line-subtle bg-surface-raised p-4 shadow-xs lg:sticky lg:top-20"
      >
        <h2 id="titulo-fechamento" className="font-medium text-content">
          Fechamento
        </h2>

        {estado.erro !== null && <FormError>{estado.erro}</FormError>}

        <Field
          nome="cliente"
          rotulo={rotulos.cliente.charAt(0).toUpperCase() + rotulos.cliente.slice(1)}
          obrigatorio={exigeCliente}
          erro={e.cliente}
        >
          <Select
            id="cliente"
            name="cliente"
            value={clienteId}
            onChange={(ev) => setClienteId(ev.target.value)}
            aria-invalid={e.cliente !== undefined}
            aria-describedby={describedBy('cliente', e.cliente)}
          >
            <option value="">{exigeCliente ? 'Escolha…' : 'Sem identificação'}</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
          {podeCadastrarCliente && !cadastrando && (
            <button
              type="button"
              onClick={() => setCadastrando(true)}
              className="inline-flex items-center gap-1 self-start text-xs text-content-accent hover:underline"
            >
              <UserPlus className="size-3.5" aria-hidden />
              Cadastrar agora
            </button>
          )}
        </Field>

        {cadastrando && (
          <div className="flex flex-col gap-2 rounded-md border border-line-subtle p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-content-default">Cadastro rápido</p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Fechar cadastro rápido"
                onClick={() => setCadastrando(false)}
              >
                <X aria-hidden />
              </Button>
            </div>
            <Label htmlFor="novo-cliente-nome" className="text-xs">
              Nome
            </Label>
            <Input
              ref={nomeClienteRef}
              id="novo-cliente-nome"
              autoComplete="off"
              maxLength={160}
              aria-invalid={estadoCliente.campos.nome !== undefined}
            />
            {estadoCliente.campos.nome !== undefined && (
              <FormError>{estadoCliente.campos.nome}</FormError>
            )}
            <Label htmlFor="novo-cliente-doc" className="text-xs">
              CPF ou CNPJ <span className="text-content-subtle">(opcional)</span>
            </Label>
            <Input
              ref={docClienteRef}
              id="novo-cliente-doc"
              autoComplete="off"
              maxLength={20}
              aria-invalid={estadoCliente.campos.documento !== undefined}
            />
            {estadoCliente.campos.documento !== undefined && (
              <FormError>{estadoCliente.campos.documento}</FormError>
            )}
            {estadoCliente.erro !== null && <FormError>{estadoCliente.erro}</FormError>}
            <Button
              type="button"
              variant="outline"
              onClick={cadastrarCliente}
              disabled={salvandoCliente}
            >
              {salvandoCliente ? 'Cadastrando…' : 'Cadastrar e escolher'}
            </Button>
          </div>
        )}

        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-content-muted">Itens</dt>
            <dd className="font-mono tabular-nums text-content">{formatCents(subtotal)}</dd>
          </div>
        </dl>

        <Field nome="desconto" rotulo="Desconto" erro={e.desconto ?? erroDoDesconto}>
          <div className="relative">
            <span
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-content-subtle"
              aria-hidden
            >
              R$
            </span>
            <Input
              id="desconto"
              name="desconto"
              inputMode="decimal"
              autoComplete="off"
              value={desconto}
              onChange={(ev) => setDesconto(ev.target.value)}
              placeholder="0,00"
              className="pl-9 tabular-nums"
              aria-invalid={descontoInvalido && desconto.trim() !== ''}
            />
          </div>
        </Field>

        <div className="flex items-baseline justify-between gap-3 border-t border-line-subtle pt-3">
          <span className="text-sm font-medium text-content-default">Total</span>
          <span
            className="font-display text-3xl font-bold tabular-nums text-content"
            aria-live="polite"
          >
            {formatCents(total)}
          </span>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-content-default">Pagamento</legend>
          {formas.length === 0 && (
            <p className="text-sm text-content-muted">
              Nenhuma forma de pagamento ativa. Quem administra cadastra em &ldquo;Formas de
              pagamento&rdquo;.
            </p>
          )}
          {pagamentos.map((p, i) => {
            const forma = formaPorId.get(p.formaId);
            const emDinheiro = forma?.codigo === 'cash';
            const recebido = parseCents(p.recebido);
            const valor = parseCents(valorDe(i)) ?? 0;
            const troco = recebido === null ? null : recebido - valor;
            return (
              <div
                key={p.chave}
                className="flex flex-col gap-2 rounded-md border border-line-subtle p-2.5"
              >
                <div className="flex items-center gap-2">
                  <Label htmlFor={`forma-${p.chave}`} className="sr-only">
                    Forma do pagamento {i + 1}
                  </Label>
                  <Select
                    id={`forma-${p.chave}`}
                    value={p.formaId}
                    onChange={(ev) => mudarPagamento(p.chave, { formaId: ev.target.value })}
                    className="min-w-0 flex-1"
                  >
                    {formas.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                      </option>
                    ))}
                  </Select>
                  <Label htmlFor={`valor-${p.chave}`} className="sr-only">
                    Valor do pagamento {i + 1}
                  </Label>
                  <Input
                    id={`valor-${p.chave}`}
                    inputMode="decimal"
                    autoComplete="off"
                    value={valorDe(i)}
                    onChange={(ev) => {
                      if (pagamentos.length === 1) setValorEditado(true);
                      mudarPagamento(p.chave, { valor: ev.target.value });
                    }}
                    placeholder="0,00"
                    className="w-28 text-right tabular-nums"
                  />
                  {pagamentos.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      aria-label={`Tirar o pagamento ${i + 1}`}
                      onClick={() => tirarPagamento(p.chave)}
                    >
                      <X aria-hidden />
                    </Button>
                  )}
                </div>
                {forma !== undefined && forma.prazoEmDias > 0 && (
                  <p className="text-xs text-content-subtle">
                    Entra no caixa em {forma.prazoEmDias} {forma.prazoEmDias === 1 ? 'dia' : 'dias'}{' '}
                    — vira conta a receber.
                  </p>
                )}
                {emDinheiro && (
                  <div className="flex items-center gap-2 text-sm">
                    <Label htmlFor={`recebido-${p.chave}`} className="text-xs text-content-muted">
                      Recebido
                    </Label>
                    <Input
                      id={`recebido-${p.chave}`}
                      inputMode="decimal"
                      autoComplete="off"
                      value={p.recebido}
                      onChange={(ev) => mudarPagamento(p.chave, { recebido: ev.target.value })}
                      placeholder="50,00"
                      className="h-8 w-24 text-right tabular-nums"
                    />
                    {troco !== null && troco >= 0 && (
                      <span className="ml-auto text-xs text-content-default">
                        Troco{' '}
                        <span className="font-mono font-medium tabular-nums">
                          {formatCents(troco)}
                        </span>
                      </span>
                    )}
                    {troco !== null && troco < 0 && (
                      <span className="ml-auto text-xs text-danger">Menos que o valor</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {formas.length > 1 && (
            <Button type="button" variant="ghost" onClick={dividir} className="self-start">
              <Plus aria-hidden />
              Dividir em outra forma
            </Button>
          )}
          {e.pagamentos !== undefined && <FormError>{e.pagamentos}</FormError>}
          {linhas.length > 0 && diferenca !== 0 && (
            <p
              role="status"
              className={cn('text-sm', diferenca > 0 ? 'text-warning' : 'text-danger')}
            >
              {diferenca > 0
                ? `Faltam ${formatCents(diferenca)} nos pagamentos.`
                : `Os pagamentos passam ${formatCents(-diferenca)} do total.`}
            </p>
          )}
        </fieldset>

        {comObservacao ? (
          <Field nome="observacao" rotulo="Observação" erro={e.observacao}>
            <Textarea id="observacao" name="observacao" maxLength={500} className="min-h-16" />
          </Field>
        ) : (
          <button
            type="button"
            onClick={() => setComObservacao(true)}
            className="self-start text-xs text-content-accent hover:underline"
          >
            Adicionar observação
          </button>
        )}

        <Submit size="lg" disabled={!pronto} pendente="Registrando…" className="w-full">
          Registrar {venda} · {formatCents(total)}
        </Submit>
        {!pronto && linhas.length > 0 && !clienteOk && (
          <p className="text-xs text-content-muted">Falta escolher {rotulos.cliente}.</p>
        )}
      </section>
    </form>
  );
}
