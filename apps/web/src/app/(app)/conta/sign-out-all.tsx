'use client';

import { MonitorSmartphone } from 'lucide-react';
import { useState } from 'react';

import { sairDeTodos } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';
import { AlertDialog } from '@/components/ui/dialog';

/**
 * Sair de todos os aparelhos, com uma pergunta antes.
 *
 * Não é destrutivo — ninguém perde dado, e basta entrar de novo —, mas derruba
 * o caixa aberto no balcão e o celular do entregador junto com o computador
 * esquecido. `warning`, e não `danger`: a confirmação é proporcional ao
 * incômodo, e pintar de vermelho o que se desfaz com um login ensina a ignorar
 * o vermelho de verdade.
 */
export function SairDeTodos() {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setAberto(true)}>
        <MonitorSmartphone aria-hidden />
        Sair de todos os aparelhos
      </Button>
      <AlertDialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        severidade="warning"
        titulo="Sair de todos os aparelhos?"
        descricao="Toda sessão desta conta é encerrada — este navegador, o celular e qualquer computador onde você tenha entrado. Quem estiver no meio de um registro perde o que não salvou."
        confirmarRotulo="Sair de todos"
        /* A ação redireciona para /entrar; o diálogo some com a navegação. */
        confirmarAction={async () => {
          await sairDeTodos();
        }}
      />
    </>
  );
}
