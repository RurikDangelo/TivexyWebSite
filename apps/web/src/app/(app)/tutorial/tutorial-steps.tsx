import {
  ArrowRight,
  CircleCheck,
  CircleHelp,
  CircleMinus,
  EyeOff,
  Lock,
  UsersRound,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { Integracao } from '@/lib/integrations/catalog';
import { type EstadoDoPasso, type Passo, SECOES } from '@/lib/tutorial/steps';
import { cn } from '@/lib/utils';

export interface PassoNaTela {
  passo: Passo;
  estado: EstadoDoPasso;
}

/** O que a empresa sabe da própria origem — lido da execução de provisionamento. */
export interface Origem {
  blueprint: string | null;
  quando: string | null;
}

const LEGENDA: Record<Exclude<EstadoDoPasso, 'feito' | 'a-fazer'>, string> = {
  'com-outra-pessoa': 'Quem faz é outra pessoa da equipe — esta tela não é do seu acesso.',
  'sem-modulo': 'Módulo não contratado nesta empresa — fica fora da conta.',
  'sem-acesso': 'Não dá para conferir com o seu acesso.',
  desconhecido: 'Não consegui conferir agora. Recarregue a página em instantes.',
  'sem-empresa': 'Escolha uma empresa para ver o progresso dela.',
};

function Marcador({ estado, numero }: { estado: EstadoDoPasso; numero: number }) {
  const base = 'flex size-8 shrink-0 items-center justify-center rounded-full';
  if (estado === 'feito') {
    return (
      <span className={cn(base, 'bg-success-soft text-success')}>
        <CircleCheck className="size-4" aria-hidden />
      </span>
    );
  }
  if (estado === 'a-fazer') {
    return (
      <span
        className={cn(
          base,
          'border border-line-strong font-mono text-xs font-semibold text-content tabular-nums',
        )}
      >
        {numero}
      </span>
    );
  }
  const Icone = {
    'com-outra-pessoa': UsersRound,
    'sem-modulo': CircleMinus,
    'sem-acesso': EyeOff,
    desconhecido: CircleHelp,
    'sem-empresa': CircleHelp,
  }[estado];
  return (
    <span className={cn(base, 'bg-surface-muted text-content-subtle')}>
      <Icone className="size-4" aria-hidden />
    </span>
  );
}

function Item({
  numero,
  titulo,
  children,
  estado,
  proximo = false,
  acao,
}: {
  numero: number;
  titulo: string;
  children: ReactNode;
  estado: EstadoDoPasso;
  proximo?: boolean;
  acao?: ReactNode;
}) {
  const apagado = estado !== 'feito' && estado !== 'a-fazer';
  return (
    <li
      className={cn(
        'relative flex animate-enter gap-3 rounded-lg p-3 sm:gap-4 sm:p-4',
        proximo && 'bg-surface-accent-soft',
      )}
    >
      <Marcador estado={estado} numero={numero} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3
            className={cn(
              'font-sans text-base font-semibold tracking-normal',
              apagado ? 'text-content-muted' : 'text-content',
            )}
          >
            {titulo}
          </h3>
          {estado === 'feito' && <Badge tone="success">Feito</Badge>}
          {proximo && <Badge tone="brand">Próximo</Badge>}
        </div>
        <div className="mt-1 text-sm text-content-muted">{children}</div>
        {acao !== undefined && <div className="mt-2.5">{acao}</div>}
      </div>
    </li>
  );
}

/**
 * O tutorial: a empresa nasce, entra, e ganha o primeiro registro de cada
 * coisa. Cada passo diz como fazer e como o sistema sabe que está feito.
 */
export function TutorialSteps({
  passos,
  temEmpresa,
  origem,
  superAdmin,
  externos,
  podeVerIntegracoes,
}: {
  passos: readonly PassoNaTela[];
  /** A empresa existe e foi escolhida: os dois primeiros passos já aconteceram. */
  temEmpresa: boolean;
  /** De que Blueprint ela nasceu, quando dá para ler. */
  origem: Origem | null;
  superAdmin: boolean;
  externos: readonly Integracao[];
  podeVerIntegracoes: boolean;
}) {
  const proximo = passos.find((p) => p.estado === 'a-fazer')?.passo.codigo;
  // Os dois primeiros são do Admin; a numeração segue deles, e pula o que é de
  // módulo não contratado — "4, 10, 11" faria parecer que faltam passos.
  const numerados = passos.filter((p) => p.estado !== 'sem-modulo');
  const numeroDe = new Map(numerados.map((p, i) => [p.passo.codigo, i + 3]));

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="secao-nasce">
        <h2
          id="secao-nasce"
          className="mb-2 font-mono text-xs uppercase tracking-wider text-content-subtle"
        >
          A empresa nasce — no Admin
        </h2>
        <Card>
          <CardContent className="pt-2">
            <ol className="flex flex-col">
              <Item
                numero={1}
                titulo="Criar a empresa com um Blueprint"
                estado={temEmpresa ? 'feito' : 'a-fazer'}
                acao={
                  superAdmin ? (
                    <Link
                      href="/admin/clientes/novo"
                      className={buttonVariants({ variant: 'outline', size: 'sm' })}
                    >
                      Criar empresa no Admin
                      <ArrowRight aria-hidden />
                    </Link>
                  ) : undefined
                }
              >
                O Super Admin escolhe o nicho — cafeteria, clínica, mercado — e o provisionamento
                liga os módulos, cria os papéis, o funil, as categorias, as formas de pagamento e o
                vocabulário.
                {origem !== null && (
                  <span className="mt-1 block text-content-default">
                    Esta empresa nasceu
                    {origem.blueprint !== null ? ` do Blueprint ${origem.blueprint}` : ''}
                    {origem.quando !== null ? `, em ${origem.quando}` : ''}.
                  </span>
                )}
              </Item>
              <Item numero={2} titulo="Entregar o acesso" estado={temEmpresa ? 'feito' : 'a-fazer'}>
                O administrador da empresa recebe um link de acesso e define a senha.{' '}
                <span className="inline-flex items-center gap-1 text-content-default">
                  <Lock className="size-3.5" aria-hidden />
                  Externo:
                </span>{' '}
                sem SMTP não sai e-mail — o Super Admin repassa o link pelo canal que já usa com o
                cliente.
              </Item>
            </ol>
          </CardContent>
        </Card>
      </section>

      {SECOES.map((secao) => {
        const daSecao = passos.filter((p) => p.passo.secao === secao.codigo);
        if (daSecao.length === 0) return null;
        const titulo = (
          <h2
            id={`secao-${secao.codigo}`}
            className="mb-2 font-mono text-xs uppercase tracking-wider text-content-subtle"
          >
            {secao.titulo}
          </h2>
        );
        // Módulo inteiro fora do contrato: uma linha, e não a mesma nota em cada passo.
        if (daSecao.every((p) => p.estado === 'sem-modulo')) {
          return (
            <section key={secao.codigo} aria-labelledby={`secao-${secao.codigo}`}>
              {titulo}
              <p className="flex items-center gap-2 rounded-lg border border-dashed border-line px-4 py-3 text-sm text-content-muted">
                <CircleMinus className="size-4 shrink-0 text-content-subtle" aria-hidden />
                Módulo não contratado nesta empresa — os passos dele ficam fora da conta.
              </p>
            </section>
          );
        }
        return (
          <section key={secao.codigo} aria-labelledby={`secao-${secao.codigo}`}>
            {titulo}
            <Card>
              <CardContent className="pt-2">
                <ol className="flex flex-col">
                  {daSecao.map(({ passo, estado }) => {
                    return (
                      <Item
                        key={passo.codigo}
                        numero={numeroDe.get(passo.codigo) ?? 0}
                        titulo={passo.titulo}
                        estado={estado}
                        proximo={passo.codigo === proximo}
                        acao={
                          estado === 'a-fazer' ? (
                            <Link
                              href={passo.href}
                              className={buttonVariants({
                                variant: passo.codigo === proximo ? undefined : 'outline',
                                size: 'sm',
                              })}
                            >
                              Fazer agora
                              <ArrowRight aria-hidden />
                            </Link>
                          ) : undefined
                        }
                      >
                        {passo.como}
                        <span className="mt-1 block text-xs text-content-subtle">
                          {estado === 'feito' || estado === 'a-fazer'
                            ? passo.prontoQuando
                            : LEGENDA[estado]}
                        </span>
                      </Item>
                    );
                  })}
                </ol>
              </CardContent>
            </Card>
          </section>
        );
      })}

      <section aria-labelledby="secao-externo">
        <h2
          id="secao-externo"
          className="mb-2 font-mono text-xs uppercase tracking-wider text-content-subtle"
        >
          O que ainda é externo
        </h2>
        <Card>
          <CardContent className="flex flex-col gap-3 pt-5 text-sm">
            <p className="text-content-muted">
              Depende de conta, credencial ou aprovação de terceiros. Nada disto está simulado — e
              nada disto impede os passos acima.
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {externos.map((i) => (
                <li key={i.codigo} className="flex gap-2">
                  <Lock className="mt-0.5 size-3.5 shrink-0 text-content-subtle" aria-hidden />
                  <span className="min-w-0">
                    <span className="font-medium text-content">{i.nome}</span>
                    <span className="text-content-muted">
                      {' — '}
                      {i.hojeSemEla}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {podeVerIntegracoes && (
              <Link
                href="/integracoes"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'self-start')}
              >
                O que falta em cada uma
                <ArrowRight aria-hidden />
              </Link>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
