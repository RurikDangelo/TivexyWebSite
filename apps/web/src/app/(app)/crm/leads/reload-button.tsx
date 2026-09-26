'use client';

import { RotateCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { Button } from '@/components/ui/button';

/**
 * "Tentar de novo" de um estado de erro de leitura.
 *
 * `router.refresh()` e não um `<Link>` para o mesmo endereço: navegar para a
 * URL em que já se está não refaz a consulta do servidor, então o botão
 * pareceria não funcionar — que é o defeito que o estado de erro existe para
 * não ter. `useTransition` dá o estado de pendência: sem ele, quem clica com a
 * rede ruim clica de novo.
 *
 * Folha da árvore: a página continua sendo Server Component.
 */
export function ReloadButton() {
  const router = useRouter();
  const [tentando, iniciar] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      carregando={tentando}
      onClick={() => iniciar(() => router.refresh())}
    >
      {tentando ? null : <RotateCw aria-hidden />}
      Tentar de novo
    </Button>
  );
}
