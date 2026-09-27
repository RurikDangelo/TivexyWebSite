import { CircleCheck } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { SectionLabel } from '@/components/ui/section-label';
import { cn } from '@/lib/utils';

/** Uma seção do tutorial, como o trilho a resume. */
export interface SecaoNoTrilho {
  /** O `id` do `<h2>` correspondente — é o destino da âncora. */
  id: string;
  rotulo: string;
  feitos: number;
  /**
   * `null` quando a seção inteira está fora do contrato da empresa, ou quando
   * não há empresa escolhida: sem denominador, "0 de 0" mentiria dizendo que
   * não falta nada.
   */
  total: number | null;
}

export interface TrilhoDeProgressoProps {
  /** `null` quando não dá para medir. Nunca zero no lugar de "não sei". */
  feitos: number | null;
  total: number | null;
  secoes: readonly SecaoNoTrilho[];
}

/**
 * O trilho lateral do tutorial: quanto falta, e para onde pular.
 *
 * Fica `sticky` na coluna (quem gruda é o `<aside>` da página) porque é a
 * informação que a pessoa mais quer olhar e era a primeira a sumir na rolagem.
 *
 * A regra de honestidade desta tela inteira mora aqui: **sem base não há
 * número**. Sem empresa escolhida não existe progresso a medir — o trilho fica
 * vazio e diz por quê, em vez de mostrar uma barra em 0% que leria como "você
 * não fez nada".
 */
export function TrilhoDeProgresso({ feitos, total, secoes }: TrilhoDeProgressoProps) {
  const medivel = feitos !== null && total !== null && total > 0;
  const completo = medivel && feitos === total;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-4">
        <div className="flex flex-col gap-2">
          <SectionLabel como="h2">Progresso</SectionLabel>
          {medivel ? (
            <p className="flex items-baseline gap-1.5">
              <span className="text-metric text-content tabular-nums">{feitos}</span>
              <span className="text-caption text-content-muted">{`de ${total} passos`}</span>
            </p>
          ) : (
            <p className="text-body text-pretty text-content-muted">
              Escolha uma empresa para ver o progresso dela. Sem empresa não há o que contar — e
              contar zero diria que nada foi feito.
            </p>
          )}
          <Progress
            valor={medivel ? feitos : null}
            maximo={medivel ? total : 100}
            tom={completo ? 'success' : 'brand'}
            rotulo="Passos do tutorial concluídos"
            descricaoDoValor={medivel ? `${feitos} de ${total} passos concluídos` : undefined}
          />
          {completo && (
            <p className="flex items-center gap-1.5 text-caption text-success">
              <CircleCheck className="size-4 shrink-0" aria-hidden />
              Tudo feito. Daqui em diante, o painel mostra o negócio.
            </p>
          )}
        </div>

        <nav aria-label="Seções do tutorial" className="flex flex-col gap-0.5">
          {secoes.map((secao) => (
            /*
             * Âncora na mesma página, não `<Link>`: não há navegação de rota
             * aqui, e o `min-h-8` é o que dá os 24px de alvo de toque.
             */
            <a
              key={secao.id}
              href={`#${secao.id}`}
              className="flex min-h-8 items-center justify-between gap-2 rounded-control px-2 text-label text-content-muted transition-base hover:bg-surface-muted hover:text-content"
            >
              <span className="min-w-0 truncate">{secao.rotulo}</span>
              <span
                className={cn(
                  'shrink-0 text-caption tabular-nums',
                  secao.total === null ? 'text-content-subtle' : 'text-content-default',
                )}
              >
                {/* Sem denominador não se escreve fração: diz-se o que é. */}
                {secao.total === null ? 'fora da conta' : `${secao.feitos}/${secao.total}`}
              </span>
            </a>
          ))}
        </nav>
      </CardContent>
    </Card>
  );
}
