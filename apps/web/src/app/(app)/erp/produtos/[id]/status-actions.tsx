'use client';

import { Ban, RotateCcw, Trash2 } from 'lucide-react';
import { useActionState, useState } from 'react';

import { FormFeedback } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
import { AlertDialog } from '@/components/ui/dialog';

import { excluirProduto, mudarSituacaoProduto } from '../actions';
import { ACAO_INICIAL } from '../state';

/**
 * Tirar de venda, voltar a vender, apagar de vez.
 *
 * Apagar confirma antes e diz a regra: só some o que nunca teve história. O
 * resto sai de venda e continua nas vendas antigas — quem decide é a chave
 * estrangeira, e a mensagem de recusa diz o caminho.
 *
 * A confirmação era um `window.confirm()`: fora do tema, fora da tipografia,
 * travando a aba — e suprimível pelo navegador, caso em que ele devolve
 * `false` e o produto simplesmente não era apagado, sem nenhum aviso. O
 * `<AlertDialog>` é `role="alertdialog"`, prende o foco, não fecha pelo véu e
 * põe o verbo destrutivo em destaque.
 */
export function ProductStatusActions({
  id,
  nome,
  ativo,
  podeEditar,
  podeExcluir,
}: {
  id: string;
  nome: string;
  ativo: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}) {
  const [situacao, mudar] = useActionState(mudarSituacaoProduto, ACAO_INICIAL);
  const [exclusao, excluir] = useActionState(excluirProduto, ACAO_INICIAL);
  const [confirmando, setConfirmando] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {podeEditar && (
        <form action={mudar} className="flex flex-col gap-2">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="ativo" value={ativo ? '0' : '1'} />
          <p className="text-caption text-content-muted">
            {ativo
              ? 'Fora de venda, deixa de aparecer para vender — e continua nas vendas antigas e no estoque.'
              : 'Está fora de venda. Voltar põe de novo na tela de venda.'}
          </p>
          <Submit variant="outline" pendente="Mudando…" className="w-full">
            {ativo ? <Ban aria-hidden /> : <RotateCcw aria-hidden />}
            {ativo ? 'Tirar de venda' : 'Voltar a vender'}
          </Submit>
          <FormFeedback estado={situacao} />
        </form>
      )}

      {podeExcluir && (
        <div className="flex flex-col gap-2 border-t border-line-subtle pt-4">
          <p className="text-caption text-content-muted">
            Só apaga o que nunca foi vendido nem movimentou estoque.
          </p>
          <Button
            type="button"
            variant="ghost"
            aria-haspopup="dialog"
            onClick={() => setConfirmando(true)}
            className="w-full text-danger hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 aria-hidden />
            Apagar de vez
          </Button>
          {/*
           * O erro aparece aqui, e não no diálogo: `excluir` é o despacho de um
           * `useActionState`, que retorna na hora, então o diálogo já fechou
           * quando o servidor responde. No caminho feliz a ação redireciona para
           * a lista; no de recusa, a faixa fica na tela que ficou.
           */}
          <FormFeedback estado={exclusao} />

          <AlertDialog
            aberto={confirmando}
            aoFechar={() => setConfirmando(false)}
            severidade="danger"
            titulo={`Apagar ${nome}?`}
            descricao="O cadastro some para sempre. Não dá para desfazer."
            confirmarRotulo="Apagar de vez"
            confirmarAction={excluir}
          >
            <input type="hidden" name="id" value={id} />
            <p className="text-body text-content-muted">
              Se este produto já apareceu em alguma venda ou movimentação de estoque, o banco recusa
              — a história precisa dele. Nesse caso, tire de venda em vez de apagar.
            </p>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
