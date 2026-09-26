import { Building2 } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';

import { EmptyState } from './empty-state';

/**
 * A tela da operação sem empresa escolhida.
 *
 * Só o Super Admin chega aqui: `requireAccess` deixa a plataforma entrar em
 * qualquer rota, e a página não tem de quem mostrar dado. Uma página em
 * branco seria a resposta errada — ela parece defeito.
 */
export function NoTenant() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <EmptyState
        icone={Building2}
        titulo="Nenhuma empresa escolhida"
        acao={
          <Link href="/admin" className={buttonVariants({ variant: 'outline' })}>
            Ir para o Super Admin
          </Link>
        }
      >
        Esta tela mostra o dado de uma empresa. Entre pelo endereço dela para ver o que ela vê.
      </EmptyState>
    </div>
  );
}
