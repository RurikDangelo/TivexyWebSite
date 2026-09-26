'use client';

import { Ban, RotateCcw, Trash2 } from 'lucide-react';
import { useActionState } from 'react';

import { FormError, FormSuccess } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';

import { excluirProduto, mudarSituacaoProduto } from '../actions';
import { ACAO_INICIAL } from '../state';

/**
 * Tirar de venda, voltar a vender, apagar de vez.
 *
 * Apagar confirma antes e diz a regra: só some o que nunca teve história. O
 * resto sai de venda e continua nas vendas antigas — quem decide é a chave
 * estrangeira, e a mensagem de recusa diz o caminho.
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

  return (
    <div className="flex flex-col gap-3 text-sm">
      {podeEditar && (
        <form action={mudar} className="flex flex-col gap-2">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="ativo" value={ativo ? '0' : '1'} />
          <p className="text-content-muted">
            {ativo
              ? 'Fora de venda, deixa de aparecer para vender — e continua nas vendas antigas e no estoque.'
              : 'Está fora de venda. Voltar põe de novo na tela de venda.'}
          </p>
          <Submit variant="outline" pendente="Mudando…">
            {ativo ? <Ban aria-hidden /> : <RotateCcw aria-hidden />}
            {ativo ? 'Tirar de venda' : 'Voltar a vender'}
          </Submit>
          {situacao.erro !== null && <FormError>{situacao.erro}</FormError>}
          {situacao.ok !== null && <FormSuccess>{situacao.ok}</FormSuccess>}
        </form>
      )}

      {podeExcluir && (
        <form
          action={excluir}
          onSubmit={(ev) => {
            if (!window.confirm(`Apagar "${nome}" de vez? Não dá para desfazer.`)) {
              ev.preventDefault();
            }
          }}
          className="flex flex-col gap-2 border-t border-line-subtle pt-3"
        >
          <input type="hidden" name="id" value={id} />
          <p className="text-content-muted">
            Só apaga o que nunca foi vendido nem movimentou estoque.
          </p>
          <Submit variant="ghost" pendente="Apagando…" className="text-danger">
            <Trash2 aria-hidden />
            Apagar de vez
          </Submit>
          {exclusao.erro !== null && <FormError>{exclusao.erro}</FormError>}
        </form>
      )}
    </div>
  );
}
