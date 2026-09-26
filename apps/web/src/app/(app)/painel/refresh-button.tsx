'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { Button } from '@/components/ui/button';

/**
 * Relê o painel sem recarregar a página.
 *
 * Substitui o link "recarregue" que morava num parágrafo de rodapé, abaixo de
 * tudo e do tamanho de uma nota — num painel cujos números são lidos no
 * instante em que a página monta, o controle de releitura pertence ao topo,
 * ao lado do seletor de período.
 *
 * `useTransition` em volta do `router.refresh()` é o que dá o estado de
 * espera: sem ele o clique não teria retorno nenhum até o servidor responder,
 * e a pessoa clicaria de novo achando que não pegou.
 *
 * Folha de cliente: o painel inteiro continua no servidor.
 */
export function AtualizarPainel() {
  const router = useRouter();
  const [lendo, iniciar] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      carregando={lendo}
      onClick={() => {
        iniciar(() => {
          router.refresh();
        });
      }}
    >
      {/* O `Button` já põe o spinner quando `carregando`; o ícone próprio sairia duplicado. */}
      {lendo ? null : <RefreshCw aria-hidden />}
      {lendo ? 'Lendo de novo…' : 'Atualizar'}
    </Button>
  );
}
