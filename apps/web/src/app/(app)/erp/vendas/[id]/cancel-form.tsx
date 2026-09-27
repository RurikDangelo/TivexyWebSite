'use client';

import { Ban } from 'lucide-react';
import { useState } from 'react';

import { Field } from '@/components/form/field';
import { FormFeedback } from '@/components/form/messages';
import { Button } from '@/components/ui/button';
import { AlertDialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import { cancelarVenda } from '../actions';
import { ACAO_INICIAL, type AcaoState } from '../state';

/**
 * Cancelar, com motivo e confirmação de verdade.
 *
 * O `window.confirm()` que havia aqui ignorava o tema e a tipografia, travava a
 * aba e — o pior — pode ser suprimido pelo navegador ("não deixar este site
 * criar mais diálogos"); suprimido, ele devolve `false` e o cancelamento
 * simplesmente não acontecia, sem nada na tela dizendo isso.
 *
 * A confirmação é proporcional ao dano: o `<AlertDialog>` exige o motivo, que
 * fica na história da venda, mas não exige digitar o número. Cancelar repõe o
 * estoque e reabre o caixa — é grave, é registrado e é auditável, mas não
 * apaga nada. Reservar a trava de digitação para o que é de fato irreversível
 * é o que a mantém eficaz.
 *
 * O texto diz o que acontece antes de acontecer: quem cancela precisa saber
 * que o dinheiro já recebido não some sozinho.
 */
export function CancelSaleForm({ id, rotulo }: { id: string; rotulo: string }) {
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<AcaoState>(ACAO_INICIAL);

  /*
   * A Server Action é chamada direto, e não por `useActionState`: o
   * `<AlertDialog>` espera a `Promise` para saber quando fechar, e o despacho
   * do `useActionState` volta na hora — o diálogo fecharia antes de o servidor
   * responder, e o retorno nunca apareceria.
   */
  async function confirmar(dados: FormData) {
    setEstado(await cancelarVenda(ACAO_INICIAL, dados));
  }

  const efeitos = (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-content-muted">
      <li>o que saiu do estoque volta;</li>
      <li>o que ainda não entrou no caixa deixa de ser esperado;</li>
      <li>o que já entrou vira uma devolução a pagar, para registrar quando devolver.</li>
    </ul>
  );

  return (
    <div className="flex flex-col gap-3">
      {efeitos}

      <Button
        type="button"
        variant="outline"
        className="self-start text-danger"
        onClick={() => setAberto(true)}
      >
        <Ban aria-hidden />
        Cancelar {rotulo}
      </Button>

      <FormFeedback estado={estado} />

      <AlertDialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        severidade="danger"
        titulo={`Cancelar ${rotulo}?`}
        descricao="Não dá para desfazer. O cancelamento fica registrado com o seu nome e o motivo."
        confirmarRotulo="Cancelar a venda"
        cancelarRotulo="Deixar como está"
        confirmarAction={confirmar}
      >
        {/* Dentro do `<form>` do diálogo: é ele que monta o `FormData` da ação. */}
        <input type="hidden" name="id" value={id} />
        {efeitos}
        <Field nome="motivo" rotulo="Motivo" obrigatorio>
          <Input
            id="motivo"
            name="motivo"
            required
            maxLength={300}
            autoComplete="off"
            placeholder="Cliente desistiu"
          />
        </Field>
      </AlertDialog>
    </div>
  );
}
