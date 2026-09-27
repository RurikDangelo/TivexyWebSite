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
 *
 * Isto é um interstício: o `NoTenant` é retornado no lugar da página inteira,
 * então ele carrega a própria medida enquanto o `<Page variant="intersticial">`
 * não existir para carregá-la por ele.
 */
export function NoTenant() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-12">
      <EmptyState
        icone={Building2}
        titulo="Nenhuma empresa escolhida"
        acao={
          <Link href="/adminpanel" className={buttonVariants({ variant: 'outline' })}>
            Ir para o Super Admin
          </Link>
        }
      >
        Esta tela mostra o dado de uma empresa. Entre pelo endereço dela para ver o que ela vê.
      </EmptyState>
    </div>
  );
}
