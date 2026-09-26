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

import { EmptyState } from '@/components/page/empty-state';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { Integracao } from '@/lib/integrations/catalog';
import { type EstadoDoPasso, type Passo, SECOES } from '@/lib/tutorial/steps';
import { atrasoDaLinha, cn } from '@/lib/utils';

export interface PassoNaTela {
  passo: Passo;
  estado: EstadoDoPasso;
}

/** O que a empresa sabe da própria origem — lido da execução de provisionamento. */
export interface Origem {
  blueprint: string | null;
  quando: string | null;
}

/**
 * Os dois passos que acontecem no Admin, antes de a empresa existir.
 *
 * Ficam fora de `passosDoTutorial()` porque não têm contagem no banco da
 * empresa: o que prova que aconteceram é a empresa existir. A lista existe
 * como constante — e não como o número 2 espalhado — porque o contador da
 * barra e a numeração dos outros passos derivam dela. Era o número mágico que
 * o UI_AUDIT apontou: acrescentar um terceiro passo de Admin exigia lembrar de
 * somar 1 em dois arquivos, e o sintoma seria uma barra que nunca chega a 100%.
 *
 * A correção completa é levá-los para `passosDoTutorial()` com uma seção
 * própria; isso mora em `lib/tutorial/steps.ts`, fora desta onda.
 */
export const PASSOS_DO_ADMIN = [
  { codigo: 'blueprint', titulo: 'Criar a empresa com um Blueprint' },
  { codigo: 'acesso', titulo: 'Entregar o acesso' },
] as const;

/** O identificador do bloco do Admin, usado pela âncora do trilho de progresso. */
export const SECAO_DO_ADMIN = 'secao-admin';

/** O título do bloco do Admin. Exportado para que o trilho aponte para o mesmo nome. */
export const TITULO_DO_ADMIN = 'A empresa nasce — no Admin';

const LEGENDA: Record<Exclude<EstadoDoPasso, 'feito' | 'a-fazer'>, string> = {
  'com-outra-pessoa': 'Quem faz é outra pessoa da equipe — esta tela não é do seu acesso.',
  'sem-modulo': 'Módulo não contratado nesta empresa — fica fora da conta.',
  'sem-acesso': 'Não dá para conferir com o seu acesso.',
  desconhecido: 'Não consegui conferir agora. Recarregue a página em instantes.',
  'sem-empresa': 'Escolha uma empresa para ver o progresso dela.',
};

function Marcador({ estado, numero }: { estado: EstadoDoPasso; numero: number }) {
  const base = 'flex size-8 shrink-0 items-center justify-center rounded-pill';
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
          'border border-line-strong text-caption font-semibold text-content tabular-nums',
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
    <span className={cn(base, 'bg-surface-sunken text-content-subtle')}>
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
        'flex animate-enter gap-3 rounded-card p-3',
        proximo && 'bg-surface-accent-soft',
      )}
      /*
       * Cadência única da casa (seção 8, regra 2), indexada pelo número do
       * passo: a cascata atravessa as seções em vez de recomeçar em cada
       * cartão. Antes os doze passos subiam em uníssono, sem atraso nenhum.
       */
      style={{ animationDelay: atrasoDaLinha(numero - 1) }}
    >
      <Marcador estado={estado} numero={numero} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className={cn('text-h3', apagado ? 'text-content-muted' : 'text-content')}>
            {titulo}
          </h3>
          {estado === 'feito' && <Badge tone="success">Feito</Badge>}
          {proximo && (
            <Badge tone="brand" Icone={ArrowRight}>
              Próximo
            </Badge>
          )}
        </div>
        <div className="mt-1 max-w-prose text-body text-pretty text-content-muted">{children}</div>
        {acao !== undefined && <div className="mt-2.5">{acao}</div>}
      </div>
    </li>
  );
}

/**
 * O cabeçalho de uma seção de passos.
 *
 * `text-h2` porque é seção de página, não versalete: em 11px mono, como estava,
 * o título da seção pesava menos que a nota de rodapé do passo.
 */
function TituloDaSecao({
  id,
  children,
  selo,
}: {
  id: string;
  children: ReactNode;
  /** Selo à direita do título — hoje só o de bloqueio externo. */
  selo?: ReactNode;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <h2 id={id} className="text-h2 text-content">
        {children}
      </h2>
      {selo}
    </div>
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
  // A numeração segue a do Admin, e pula o que é de módulo não contratado —
  // "4, 10, 11" faria parecer que faltam passos.
  const numerados = passos.filter((p) => p.estado !== 'sem-modulo');
  const numeroDe = new Map(
    numerados.map((p, i) => [p.passo.codigo, i + PASSOS_DO_ADMIN.length + 1]),
  );

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby={SECAO_DO_ADMIN}>
        <TituloDaSecao id={SECAO_DO_ADMIN}>{TITULO_DO_ADMIN}</TituloDaSecao>
        <Card>
          <CardContent className="pt-2">
            <ol className="flex flex-col gap-1">
              <Item
                numero={1}
                titulo={PASSOS_DO_ADMIN[0].titulo}
                estado={temEmpresa ? 'feito' : 'a-fazer'}
                acao={
                  superAdmin ? (
                    <Link
                      href="/adminpanel/clientes/novo"
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
              <Item
                numero={2}
                titulo={PASSOS_DO_ADMIN[1].titulo}
                estado={temEmpresa ? 'feito' : 'a-fazer'}
              >
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
        const id = `secao-${secao.codigo}`;

        // Módulo inteiro fora do contrato: uma linha, e não a mesma nota em cada passo.
        if (daSecao.every((p) => p.estado === 'sem-modulo')) {
          return (
            <section key={secao.codigo} aria-labelledby={id}>
              <TituloDaSecao id={id}>{secao.titulo}</TituloDaSecao>
              {/*
               * Vazio por decisão contratual, e não por falta de uso: o
               * `EmptyState` diz o que está vazio, por que está, e a quem
               * recorrer — o que a linha tracejada de antes não dizia.
               */}
              <EmptyState
                estado="vazio"
                icone={CircleMinus}
                titulo="Módulo não contratado"
                densidade="compacta"
              >
                Esta empresa não contratou {secao.titulo}, então os passos desse módulo ficam fora
                da conta do progresso. Quem contratou o plano pode habilitá-lo.
              </EmptyState>
            </section>
          );
        }

        return (
          <section key={secao.codigo} aria-labelledby={id}>
            <TituloDaSecao id={id}>{secao.titulo}</TituloDaSecao>
            <Card>
              <CardContent className="pt-2">
                <ol className="flex flex-col gap-1">
                  {daSecao.map(({ passo, estado }) => (
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
                            /*
                             * Uma ação `brand` por tela (seção 7, P15): só o
                             * próximo passo é preenchido. Doze botões azuis
                             * numa página não apontam para lugar nenhum.
                             */
                            className={buttonVariants({
                              variant: passo.codigo === proximo ? 'brand' : 'outline',
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
                      <span className="mt-1 block text-caption text-content-subtle">
                        {estado === 'feito' || estado === 'a-fazer'
                          ? passo.prontoQuando
                          : LEGENDA[estado]}
                      </span>
                    </Item>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </section>
        );
      })}

      <section aria-labelledby="secao-externo">
        <TituloDaSecao
          id="secao-externo"
          /* O selo diz o que o CLAUDE.md exige: isto não está pronto e não está simulado. */
          selo={
            <Badge tone="warning" Icone={Lock}>
              Bloqueado por terceiros
            </Badge>
          }
        >
          O que ainda é externo
        </TituloDaSecao>
        <Card>
          <CardContent className="flex flex-col gap-3 pt-4">
            <p className="max-w-prose text-body text-pretty text-content-muted">
              Depende de conta, credencial ou aprovação de terceiros. Nada disto está simulado — e
              nada disto impede os passos acima.
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {externos.map((i) => (
                <li key={i.codigo} className="flex gap-2">
                  <Lock className="mt-0.5 size-3.5 shrink-0 text-content-subtle" aria-hidden />
                  <span className="min-w-0 text-body">
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
