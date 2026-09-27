'use client';

import { formatCents } from '@tivexy/core';
import { Minus, Plus, Trash2 } from 'lucide-react';
import type { KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { TD, TR } from '@/components/ui/table';

import type { ItemDaVenda } from './hooks';

export interface SaleLineItemProps {
  item: ItemDaVenda;
  aoMudarQuantidade: (chave: string, quantidade: string) => void;
  aoPassar: (chave: string, delta: number) => void;
  aoTirar: (chave: string) => void;
  /** Enter na quantidade volta para o próximo bipe, não envia a venda. */
  aoVoltarParaBusca: () => void;
}

/**
 * Uma linha do carrinho.
 *
 * Linha de tabela, não cartão: é o que alinha quantidade e total entre itens e
 * deixa a coluna de dinheiro legível de cima a baixo. A densidade `densa` do
 * `<Table>` em volta dá 36px por linha — e o controle de quantidade, de 32px,
 * cabe dentro dela.
 *
 * Produto que sumiu do cadastro entre a carga da página e o registro aparece
 * como falta, com o id à mostra: a alternativa seria um travessão mudo numa
 * linha que impede registrar.
 */
export function SaleLineItem({
  item,
  aoMudarQuantidade,
  aoPassar,
  aoTirar,
  aoVoltarParaBusca,
}: SaleLineItemProps) {
  const nome = item.produto?.nome ?? 'Item fora do cadastro';
  const idQuantidade = `qtd-${item.chave}`;
  const idErro = `${idQuantidade}-erro`;
  /* Erro de campo vazio não se mostra antes de a pessoa ter tido a chance de preencher. */
  const mostraProblema = item.problema !== null && item.digitado.trim() !== '';

  function aoTeclar(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key !== 'Enter') return;
    evento.preventDefault();
    aoVoltarParaBusca();
  }

  return (
    <TR>
      <TD rotulo="Item" truncar>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-content">{nome}</span>
          <span className="text-caption text-num text-content-muted">
            {item.produto === undefined
              ? 'saiu de venda — tire da lista'
              : `${formatCents(item.produto.precoCentavos)} / ${item.unidade}`}
          </span>
        </span>
      </TD>

      <TD rotulo="Quantidade" alinhamento="fim" className="w-px">
        <span className="flex flex-col items-end gap-1">
          <span className="flex items-center gap-1.5">
            {!item.fracionada && (
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={`Um a menos de ${nome}`}
                onClick={() => aoPassar(item.chave, -1)}
              >
                <Minus aria-hidden />
              </Button>
            )}
            <Label htmlFor={idQuantidade} className="sr-only">
              Quantidade de {nome}
            </Label>
            <Input
              id={idQuantidade}
              size="sm"
              inputMode="decimal"
              autoComplete="off"
              value={item.digitado}
              onChange={(evento) => aoMudarQuantidade(item.chave, evento.target.value)}
              onKeyDown={aoTeclar}
              placeholder={item.fracionada ? '0,350' : '1'}
              className="w-20 text-center tabular-nums"
              aria-invalid={item.problema !== null}
              aria-describedby={mostraProblema ? idErro : undefined}
            />
            <span className="w-7 shrink-0 text-caption text-content-muted">{item.unidade}</span>
            {!item.fracionada && (
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={`Um a mais de ${nome}`}
                onClick={() => aoPassar(item.chave, 1)}
              >
                <Plus aria-hidden />
              </Button>
            )}
          </span>
          {mostraProblema && (
            <span id={idErro} role="alert" className="text-caption text-danger">
              {item.problema}
            </span>
          )}
        </span>
      </TD>

      <TD rotulo="Total" numerico>
        {item.totalCentavos === null ? (
          <span className="text-content-subtle">—</span>
        ) : (
          formatCents(item.totalCentavos)
        )}
      </TD>

      <TD acoes>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Tirar ${nome} da venda`}
          onClick={() => aoTirar(item.chave)}
        >
          <Trash2 aria-hidden />
        </Button>
      </TD>
    </TR>
  );
}
