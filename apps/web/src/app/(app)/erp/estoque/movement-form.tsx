'use client';

import { useActionState, useRef } from 'react';

import { ERP_MOVEMENT_KINDS, ERP_MOVEMENT_LABEL } from '@tivexy/core';
import { PainelDeCadastro } from '@/components/crm/create-panel';
import { Campo, CampoSelecao } from '@/components/ui/field';

import { lancarMovimento } from './actions';
import { MOVIMENTO_INICIAL, type ProdutoDeEstoque } from './state';

/**
 * Lançar entrada, saída ou ajuste.
 *
 * Só produtos que controlam estoque aparecem: serviço não tem o que
 * movimentar, e oferecê-lo produziria um erro que a pessoa não tem como
 * prever pelo formulário.
 */
export function MovementForm({ produtos }: { produtos: readonly ProdutoDeEstoque[] }) {
  const [estado, acao] = useActionState(lancarMovimento, MOVIMENTO_INICIAL);
  const primeiro = useRef<HTMLInputElement>(null);

  if (produtos.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line-subtle px-4 py-6 text-center text-sm text-content-muted">
        Cadastre um produto que controle estoque antes de lançar movimento.
      </p>
    );
  }

  return (
    <PainelDeCadastro
      titulo="Lançar movimento"
      acao={acao}
      estado={estado}
      confirmacao={(nome) => `Movimento lançado em ${nome}.`}
      rotuloEnviar="Lançar"
      aoSalvar={() => primeiro.current?.focus()}
    >
      <CampoSelecao
        nome="product_id"
        rotulo="Produto"
        obrigatorio
        vazio="Escolha…"
        erro={estado.campos.product_id}
        opcoes={produtos.map((p) => ({ valor: p.id, texto: `${p.nome} (${p.unit})` }))}
      />
      <CampoSelecao
        nome="kind"
        rotulo="Tipo"
        obrigatorio
        padrao="in"
        erro={estado.campos.kind}
        opcoes={ERP_MOVEMENT_KINDS.map((k) => ({ valor: k, texto: ERP_MOVEMENT_LABEL[k] }))}
        dica="Ajuste é inventário ou correção — não é compra nem venda."
      />
      <Campo
        nome="quantity"
        rotulo="Quantidade"
        obrigatorio
        referencia={primeiro}
        erro={estado.campos.quantity}
        placeholder="10"
        dica="Sempre positiva. O sinal vem do tipo."
      />
      <Campo
        nome="reason"
        rotulo="Motivo"
        placeholder="Compra do fornecedor / quebra / contagem"
        dica="Fica no histórico. Quem ler daqui a seis meses precisa entender."
      />
    </PainelDeCadastro>
  );
}
