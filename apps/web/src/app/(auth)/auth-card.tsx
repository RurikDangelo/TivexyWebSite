import type { ReactNode } from 'react';

import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface AuthCardProps {
  titulo: string;
  descricao: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * O cartão das quatro telas de entrada.
 *
 * Existe por dois motivos que só aparecem juntos:
 *
 * **1. O `<h1>` que não existia.** As cinco telas de entrada titulavam com
 * `CardTitle`, que é um `<h3>` — a primeira página do produto começava a
 * hierarquia em nível 3, sem nada acima. Aqui o título é `<h1>` uma vez, e
 * nenhuma tela tem como esquecer.
 *
 * **2. A folga.** O `Card` do sistema nasce com 16px de respiro, medida de
 * cartão dentro de uma lista de cartões. Este é o único bloco da tela e carrega
 * um título de 36px: com 16px, o texto encosta na borda. O ajuste desce pelas
 * variáveis que o próprio `Card` expõe (`--card-pad`), e não por um `p-6` que
 * brigaria com o padding interno das partes.
 *
 * `shadow-raised` em vez de `shadow-card`: no tema claro o cartão de login era
 * branco sobre branco e simplesmente não se separava da página. Com `body` em
 * `--surface-page` o degrau já existe; a elevação maior é o que faz dele o
 * assunto da tela, e não mais uma caixa nela.
 */
export function AuthCard({ titulo, descricao, children, className }: AuthCardProps) {
  return (
    /*
     * `animate-enter` no cartão inteiro, e em mais nada desta tela: a seção 8
     * autoriza um evento de entrada por tela. O painel de marca ao lado é fixo
     * de propósito — dois movimentos concorrentes na primeira impressão leem
     * como página instável, não como produto vivo.
     */
    <Card
      className={cn(
        'animate-enter shadow-raised [--card-pad-tight:1rem] [--card-pad:1.5rem]',
        className,
      )}
    >
      <CardHeader>
        <h1 className="text-display text-content">{titulo}</h1>
        <CardDescription className="text-body-lg text-content-muted">{descricao}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}
