import { Page } from '@/components/page/page';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton, SkeletonForm } from '@/components/ui/skeleton';

/**
 * A forma de `/configuracoes`: mesma largura de ajuste, mesma pilha de cartões.
 *
 * Quatro cartões, que é o mínimo que toda empresa vê — o de tipos de atividade
 * só existe com CRM, e prometer um bloco que pode não chegar é o salto que
 * este arquivo evita.
 */
export default function Loading() {
  return (
    <Page variant="ajuste">
      <div role="status" aria-busy className="flex flex-col gap-4">
        <span className="sr-only">Carregando as configurações</span>

        <div className="mb-5 flex flex-col gap-2">
          <Skeleton largura="12rem" altura="1.5rem" />
          <Skeleton largura="min(24rem, 100%)" altura="1rem" />
        </div>

        <CartaoEmEspera campos={3} />
        <CartaoEmEspera campos={5} comDescricao />
        <CartaoEmEspera campos={2} comDescricao />
        <CartaoEmEspera campos={1} comDescricao />
      </div>
    </Page>
  );
}

function CartaoEmEspera({ campos, comDescricao }: { campos: number; comDescricao?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton largura="10rem" altura="1rem" />
        {comDescricao === true && <Skeleton largura="min(20rem, 100%)" altura="0.8125rem" />}
      </CardHeader>
      <CardContent>
        <SkeletonForm campos={campos} />
      </CardContent>
    </Card>
  );
}
