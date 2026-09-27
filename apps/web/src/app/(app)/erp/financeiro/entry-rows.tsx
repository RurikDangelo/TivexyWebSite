'use client';

import { formatCents } from '@tivexy/core';
import { Ban, Check, MoreHorizontal, Receipt, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Submit } from '@/components/form/submit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertDialog, Dialog } from '@/components/ui/dialog';
import { DropdownItem, DropdownMenu } from '@/components/ui/dropdown-menu';
import { Input, Label } from '@/components/ui/input';
import { TBody, TD, TH, THead, TR, Table, hrefDeOrdem } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { TOM_DA_SITUACAO } from '@/lib/erp/finance-text';
import { atrasoDaLinha, cn } from '@/lib/utils';

import { cancelarLancamento, darBaixa, desfazerBaixa } from './actions';
import { ACAO_INICIAL, type AcaoState, type LancamentoNaTela } from './state';

/*
 * A lista do financeiro (Onda 5).
 *
 * Três mudanças estruturais, todas vindas do UI_AUDIT:
 *
 * 1. `entry-rows.tsx:38` — cada linha era um componente cliente com TRÊS
 *    `useActionState` próprios. Com 50 por página, 150 estados de ação por
 *    tela. Agora a ação é chamada direto (Server Action é função), e o único
 *    estado da lista é qual lançamento está sob diálogo.
 * 2. `entry-rows.tsx:81-119` — o bloco de ações era renderizado inline em toda
 *    linha: cem botões "Registrar recebimento"/"Cancelar" empilhados, competindo
 *    com os valores. Viraram um menu por linha.
 * 3. `entry-rows.tsx:106` e `:178` — o `window.confirm()` virou `AlertDialog`, e
 *    os `FormSuccess` que ficavam para sempre dentro do `<li>` viraram toast.
 *    Confirmação de ação é mensagem de momento; erro, não — por isso o toast de
 *    erro é o único que não expira sozinho (é o padrão do primitivo).
 */

const SITUACAO = {
  receivable: { paid: 'Recebido', open: 'Em aberto', overdue: 'Vencido', cancelled: 'Cancelado' },
  payable: { paid: 'Pago', open: 'Em aberto', overdue: 'Vencido', cancelled: 'Cancelado' },
} as const;

type TipoDeAcao = 'baixa' | 'desfazer' | 'cancelar';

interface Alvo {
  tipo: TipoDeAcao;
  l: LancamentoNaTela;
}

export interface EntryRowsProps {
  lancamentos: readonly LancamentoNaTela[];
  direcao: 'receivable' | 'payable';
  podeEditar: boolean;
  /** O dia do tenant: teto da data de baixa. */
  hoje: string;
  rotuloVenda: string;
  /** O `?ordem=` vigente, já validado pela página. */
  ordem: string | null;
  /** Aba, filtro e busca — o que os links de ordenação precisam preservar. */
  paramsDaOrdem: Readonly<Record<string, string>>;
  /** Entrada escalonada das linhas. Só na primeira chegada (seção 8, regra 3). */
  animar?: boolean;
}

/** As contas de uma direção. Cancelado continua na lista — riscado, com o motivo. */
export function EntryRows({
  lancamentos,
  direcao,
  podeEditar,
  hoje,
  rotuloVenda,
  ordem,
  paramsDaOrdem,
  animar = false,
}: EntryRowsProps) {
  const { mostrar } = useToast();
  const [alvo, setAlvo] = useState<Alvo | null>(null);

  const verbo = direcao === 'receivable' ? 'recebimento' : 'pagamento';
  const rotuloDeQuem = direcao === 'receivable' ? 'De quem' : 'Para quem';
  const fechar = () => setAlvo(null);

  /**
   * Executa a ação e conta o que aconteceu.
   *
   * No erro o diálogo de baixa fica aberto: a recusa do banco costuma ser
   * corrigível ali mesmo ("a data não pode ser futura"), e fechar obrigaria a
   * pessoa a reabrir e redigitar. Os dois `AlertDialog` fecham sozinhos quando a
   * ação resolve — neles, quem segura a mensagem é o toast de erro, que por
   * contrato do primitivo não expira.
   */
  async function executar(
    acao: (anterior: AcaoState, form: FormData) => Promise<AcaoState>,
    dados: FormData,
    tituloDoErro: string,
  ): Promise<void> {
    const r = await acao(ACAO_INICIAL, dados);
    if (r.erro !== null) {
      mostrar({ tom: 'erro', titulo: tituloDoErro, descricao: r.erro });
      return;
    }
    mostrar({ tom: 'sucesso', titulo: r.ok ?? 'Pronto.' });
    fechar();
  }

  const ordemDa = (chave: string) => ({
    chave,
    atual: ordem,
    href: hrefDeOrdem(paramsDaOrdem, chave, ordem),
  });

  return (
    <>
      <Table
        /*
         * `densa` e uma linha por célula: a meta de densidade é 15-18 registros
         * visíveis em 1080p, contra os 8 do cartão-linha de 100px que estava
         * aqui. Duas linhas em qualquer célula derrubaria a conta para 12.
         */
        densidade="densa"
        rotulo={`Lançamentos ${direcao === 'receivable' ? 'a receber' : 'a pagar'}`}
      >
        <THead sticky>
          <TR>
            <TH ordem={ordemDa('descricao')}>Descrição</TH>
            <TH className="hidden lg:table-cell">{rotuloDeQuem}</TH>
            <TH className="hidden xl:table-cell">Categoria</TH>
            <TH>Situação</TH>
            <TH ordem={ordemDa('vencimento')} className="hidden md:table-cell">
              Vencimento
            </TH>
            <TH ordem={ordemDa('valor')} alinhamento="fim">
              Valor
            </TH>
            {podeEditar && (
              <TH alinhamento="fim">
                <span className="sr-only">Ações</span>
              </TH>
            )}
          </TR>
        </THead>

        <TBody>
          {lancamentos.map((l, i) => {
            const aberto = l.situacao === 'open' || l.situacao === 'overdue';
            const detalhe =
              l.situacao === 'paid' && l.pagoEm !== null
                ? `em ${l.pagoEm}`
                : l.situacao === 'cancelled'
                  ? (l.motivoDoCancelamento ?? '')
                  : l.prazoTexto;

            return (
              <TR
                key={l.id}
                /*
                 * A âncora que o painel "Vencendo até daqui a 7 dias" usa. O
                 * pulso de `target:` é o que diz "é esta a linha" — sem ele o
                 * link levaria à lista certa e à linha invisível.
                 */
                id={`lanc-${l.id}`}
                className={cn('target:animate-highlight', animar && 'animate-enter')}
                style={animar ? { animationDelay: atrasoDaLinha(i) } : undefined}
              >
                {/*
                 * Fluxo inline, sem flex aninhado: as reticências de `truncar`
                 * são desenhadas pela própria célula, e um contêiner flex dentro
                 * dela não teria largura definida para cortar.
                 */}
                <TD truncar rotulo="Descrição">
                  <span className="font-medium text-content">{l.descricao}</span>
                  {l.venda !== null && (
                    <Link
                      href={`/erp/vendas/${l.venda.id}`}
                      className="ml-2 rounded-control text-caption text-content-accent hover:underline"
                    >
                      {rotuloVenda} nº {l.venda.numero}
                    </Link>
                  )}
                </TD>

                <TD truncar rotulo={rotuloDeQuem} className="hidden lg:table-cell">
                  {l.quem ?? <span className="text-content-subtle">sem contraparte</span>}
                </TD>

                <TD rotulo="Categoria" className="hidden xl:table-cell">
                  {l.categoria === null ? (
                    <span className="text-content-subtle">—</span>
                  ) : (
                    <Badge tamanho="xs">{l.categoria}</Badge>
                  )}
                </TD>

                <TD truncar rotulo="Situação">
                  <Badge tone={TOM_DA_SITUACAO[l.situacao]} tamanho="xs">
                    {SITUACAO[direcao][l.situacao]}
                  </Badge>
                  {detalhe !== '' && (
                    <span
                      className={cn(
                        'ml-2 text-caption',
                        l.situacao === 'overdue' ? 'text-danger' : 'text-content-muted',
                      )}
                    >
                      {detalhe}
                    </span>
                  )}
                </TD>

                <TD numerico rotulo="Vencimento" className="hidden md:table-cell">
                  {l.vencimentoTexto}
                </TD>

                <TD
                  numerico
                  rotulo="Valor"
                  className={
                    l.situacao === 'cancelled' ? 'text-content-subtle line-through' : 'text-content'
                  }
                >
                  {formatCents(l.valorCentavos)}
                </TD>

                {/* Sem `rotulo`: o menu se explica sozinho, e a linha cancelada não tem menu. */}
                {podeEditar && (
                  <TD acoes>
                    <MenuDaLinha
                      l={l}
                      aberto={aberto}
                      verbo={verbo}
                      rotuloVenda={rotuloVenda}
                      aoEscolher={(tipo) => setAlvo({ tipo, l })}
                    />
                  </TD>
                )}
              </TR>
            );
          })}
        </TBody>
      </Table>

      {alvo?.tipo === 'baixa' && (
        <Dialog
          aberto
          aoFechar={fechar}
          tamanho="sm"
          titulo={`Registrar ${verbo}`}
          descricao={`${alvo.l.descricao} · ${formatCents(alvo.l.valorCentavos)}`}
        >
          <form
            action={async (dados) => {
              await executar(darBaixa, dados, `Não deu para registrar o ${verbo}`);
            }}
            className="flex flex-col gap-4"
          >
            <input type="hidden" name="id" value={alvo.l.id} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="baixa-pago-em">
                Em que dia o dinheiro {direcao === 'receivable' ? 'entrou' : 'saiu'}
              </Label>
              <Input
                id="baixa-pago-em"
                name="pagoEm"
                type="date"
                required
                max={hoje}
                defaultValue={hoje}
                aria-describedby="baixa-ajuda"
              />
              <p id="baixa-ajuda" className="text-caption text-content-subtle">
                Baixa é o que já aconteceu: data futura o sistema recusa.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={fechar}>
                Voltar
              </Button>
              <Submit pendente="Registrando…">Confirmar {verbo}</Submit>
            </div>
          </form>
        </Dialog>
      )}

      {alvo?.tipo === 'desfazer' && (
        <AlertDialog
          aberto
          aoFechar={fechar}
          /* `warning`, não `danger`: desfazer é reversível — basta registrar de novo. */
          severidade="warning"
          titulo={`Desfazer o ${verbo}?`}
          descricao={`“${alvo.l.descricao}” volta a ficar em aberto, com vencimento em ${alvo.l.vencimentoTexto}, e volta a contar no fluxo de caixa.`}
          confirmarRotulo={`Desfazer ${verbo}`}
          cancelarRotulo="Voltar"
          confirmarAction={async (dados) => {
            await executar(desfazerBaixa, dados, `Não deu para desfazer o ${verbo}`);
          }}
        >
          <input type="hidden" name="id" value={alvo.l.id} />
        </AlertDialog>
      )}

      {alvo?.tipo === 'cancelar' && (
        <AlertDialog
          aberto
          aoFechar={fechar}
          severidade="danger"
          titulo="Cancelar este lançamento?"
          descricao={`“${alvo.l.descricao}”, ${formatCents(alvo.l.valorCentavos)}. Ele não some: continua na lista, riscado, com o motivo — e sai do fluxo de caixa.`}
          confirmarRotulo="Cancelar lançamento"
          cancelarRotulo="Voltar"
          confirmarAction={async (dados) => {
            await executar(cancelarLancamento, dados, 'Não deu para cancelar');
          }}
        >
          <input type="hidden" name="id" value={alvo.l.id} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cancelar-motivo">Motivo</Label>
            <Input
              id="cancelar-motivo"
              name="motivo"
              required
              maxLength={300}
              autoComplete="off"
              placeholder="Lançado em dobro"
              aria-describedby="cancelar-ajuda"
            />
            <p id="cancelar-ajuda" className="text-caption text-content-subtle">
              Fica na história do lançamento. Até 300 caracteres.
            </p>
          </div>
        </AlertDialog>
      )}
    </>
  );
}

/**
 * As ações de um lançamento, num menu por linha.
 *
 * Sem item nenhum não há menu: um botão que abre uma lista vazia é um controle
 * morto. É o caso da linha cancelada que não veio de venda.
 */
function MenuDaLinha({
  l,
  aberto,
  verbo,
  rotuloVenda,
  aoEscolher,
}: {
  l: LancamentoNaTela;
  aberto: boolean;
  verbo: string;
  rotuloVenda: string;
  aoEscolher: (tipo: TipoDeAcao) => void;
}) {
  /* O lançamento que nasceu de uma venda segue a venda: o banco recusa o cancelamento. */
  const podeCancelar = aberto && l.venda === null;
  const temAlgo = aberto || l.situacao === 'paid' || l.venda !== null;
  if (!temAlgo) return null;

  return (
    <DropdownMenu
      rotulo={`Ações de ${l.descricao}`}
      alinhamento="fim"
      classNameGatilho="size-8 justify-center text-content-muted hover:bg-surface-muted hover:text-content"
      gatilho={
        <>
          <MoreHorizontal className="size-4" aria-hidden />
          <span className="sr-only">Ações de {l.descricao}</span>
        </>
      }
    >
      {aberto && (
        <DropdownItem Icone={Check} onSelect={() => aoEscolher('baixa')}>
          Registrar {verbo}
        </DropdownItem>
      )}
      {l.situacao === 'paid' && (
        <DropdownItem Icone={RotateCcw} onSelect={() => aoEscolher('desfazer')}>
          Desfazer {verbo}
        </DropdownItem>
      )}
      {l.venda !== null && (
        <DropdownItem Icone={Receipt} href={`/erp/vendas/${l.venda.id}`}>
          Abrir {rotuloVenda} nº {l.venda.numero}
        </DropdownItem>
      )}
      {podeCancelar && (
        <DropdownItem Icone={Ban} destrutivo onSelect={() => aoEscolher('cancelar')}>
          Cancelar lançamento
        </DropdownItem>
      )}
    </DropdownMenu>
  );
}
