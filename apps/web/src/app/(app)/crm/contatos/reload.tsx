'use client';

import { RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';

/**
 * "Tentar de novo" do estado de erro da lista.
 *
 * `router.refresh()` e não `location.reload()`: refaz só a consulta do servidor
 * e mantém o que a pessoa já tinha na tela — busca digitada, rolagem, foco. Uma
 * leitura que falhou costuma ser intermitente, e recarregar o documento inteiro
 * para reexecutar um `select` é caro para quem está com a conexão ruim.
 *
 * Folha de cliente: existe porque tentar de novo é um evento. Quem a renderiza
 * continua sendo Server Component.
 */
export function BotaoRecarregar({ rotulo = 'Tentar de novo' }: { rotulo?: string }) {
  const router = useRouter();

  return (
    <Button variant="outline" onClick={() => router.refresh()}>
      <RotateCcw aria-hidden />
      {rotulo}
    </Button>
  );
}
