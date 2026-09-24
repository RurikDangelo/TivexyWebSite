import { ArrowRight, Check, Lock, Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAccess } from '@/lib/auth/require';
import { supabaseServer } from '@/lib/supabase/server';

import {
  ESTADO_VAZIO,
  type EstadoDoCliente,
  PASSOS,
  type Passo,
  progresso,
  proximoPasso,
} from './passos';

export const metadata: Metadata = { title: 'Primeiros passos' };

/**
 * O caminho inteiro, do cliente criado até a automação trabalhando.
 *
 * ## Interativo quer dizer que ele olha o seu cliente
 *
 * Cada passo é conferido contra o banco: o que já foi feito aparece feito. É a
 * diferença entre um tutorial e uma página de ajuda — aqui a lista sabe onde
 * você parou, e o botão do topo leva exatamente ao próximo.
 *
 * ## Ele diz o que ainda não fecha
 *
 * Três coisas do fluxo dependem de alguém de fora: o convite não sai por
 * e-mail sem SMTP, não há emissão fiscal e não há WhatsApp. Elas aparecem
 * **dentro do passo**, junto do contorno — não num rodapé.
 *
 * Um tutorial que ensina a convidar alguém e não diz que o e-mail não sai
 * produz exatamente o problema que deveria evitar: a pessoa convida, espera, e
 * o convidado nunca recebe nada. Há teste travando a presença das três.
 */
export default async function TutorialPage() {
  const { choice } = await requireAccess('/tutorial');
  if (choice.kind !== 'resolved') return null;

  const estado = await lerEstado(choice.tenant.id);
  const { feitos, total } = progresso(estado);
  const proximo = proximoPasso(estado);
  const porcentagem = Math.round((feitos / total) * 100);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-content sm:text-3xl">
          Primeiros passos
        </h1>
        <p className="mt-1 text-content-muted">
          O caminho inteiro: do cliente criado até uma regra trabalhando sozinha. Esta página
          confere o que você já fez.
        </p>
      </header>

      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-display text-xl font-bold text-content">
              {feitos} de {total}
            </span>
            <span className="text-sm text-content-muted">
              {proximo === null ? 'Tudo pronto.' : `Falta: ${proximo.titulo.toLowerCase()}`}
            </span>
          </div>

          {/*
            A barra é `progress` de verdade, não uma div colorida: leitor de
            tela anuncia a proporção sozinho, e é o elemento que existe para
            isto.
          */}
          <progress
            value={feitos}
            max={total}
            aria-label={`${feitos} de ${total} passos concluídos`}
            className="h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-surface-brand [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-surface-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-surface-brand [&::-webkit-progress-value]:transition-all"
          >
            {porcentagem}%
          </progress>

          {proximo !== null && proximo.href !== null && (
            <Link
              href={proximo.href}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-content-accent hover:underline"
            >
              Ir para {proximo.titulo.toLowerCase()}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </CardContent>
      </Card>

      <ol className="flex flex-col gap-3">
        {PASSOS.map((passo, indice) => (
          <PassoCard
            key={passo.id}
            passo={passo}
            numero={indice + 1}
            feito={passo.feito(estado)}
            atual={proximo?.id === passo.id}
          />
        ))}
      </ol>

      <Card className="mt-8 border-warning/30">
        <CardHeader>
          <CardTitle className="text-base">O que ainda não fecha sozinho</CardTitle>
          <CardDescription>
            Estas três coisas dependem de conta, credencial ou serviço de terceiro. Estão escritas
            aqui porque um sistema que finge que elas funcionam é pior do que um que diz que não.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <Externo
            titulo="O convite não sai por e-mail"
            detalhe="Falta um servidor de envio próprio. A conta é criada normalmente; o que não acontece é a entrega — e a tela gera um link para repassar."
          />
          <Externo
            titulo="Não há emissão fiscal"
            detalhe="Depende de provedor fiscal e certificado digital. O Tivexy registra a venda; nota fiscal é outra coisa, e simulá-la tem consequência legal."
          />
          <Externo
            titulo="Não há WhatsApp nem cobrança"
            detalhe="Atendimento pela Meta e cobrança por adquirente dependem de credenciais que o projeto não tem. Registrar que o cliente pagou não é receber."
          />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * O estado do cliente, em contagens.
 *
 * Uma consulta por tabela, todas em paralelo e com `head: true` — o que volta
 * é o número, não as linhas. Ler as linhas para depois contá-las traria a base
 * inteira para desenhar nove marcadores.
 *
 * Escritas **por extenso**, e não num laço com o nome da tabela em variável:
 * duas delas precisam de filtro próprio (membro ativo, venda confirmada), e
 * um laço com exceção é mais difícil de ler que nove linhas diretas.
 *
 * Falha em qualquer uma vira zero, não erro. Um tutorial que não abre porque
 * uma contagem falhou é pior do que um que mostra um passo como pendente sem
 * estar.
 */
async function lerEstado(tenantId: string): Promise<EstadoDoCliente> {
  try {
    const supabase = await supabaseServer();
    const doTenant = (tabela: string) =>
      supabase.from(tabela).select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);

    const [
      membros,
      leads,
      contas,
      atividades,
      produtos,
      movimentos,
      vendas,
      lancamentos,
      automacoes,
    ] = await Promise.all([
      /* Só membro **ativo** conta: convite pendente não abre nada, e marcar o
         passo como feito faria a pessoa seguir sem conseguir entrar. */
      doTenant('tenant_users').eq('status', 'active'),
      doTenant('crm_leads'),
      doTenant('crm_companies'),
      doTenant('crm_activities'),
      doTenant('erp_products'),
      doTenant('erp_stock_movements'),
      /* Rascunho não conta: nada aconteceu no estoque nem no financeiro. */
      doTenant('erp_sales').eq('status', 'confirmed'),
      doTenant('finance_entries'),
      doTenant('automation_rules'),
    ]);

    return {
      membrosAtivos: membros.count ?? 0,
      leads: leads.count ?? 0,
      contas: contas.count ?? 0,
      atividades: atividades.count ?? 0,
      produtos: produtos.count ?? 0,
      movimentos: movimentos.count ?? 0,
      vendasConfirmadas: vendas.count ?? 0,
      lancamentos: lancamentos.count ?? 0,
      automacoes: automacoes.count ?? 0,
    };
  } catch {
    return ESTADO_VAZIO;
  }
}

function PassoCard({
  passo,
  numero,
  feito,
  atual,
}: {
  passo: Passo;
  numero: number;
  feito: boolean;
  atual: boolean;
}) {
  return (
    <li
      className={
        atual
          ? 'rounded-lg border border-content-accent bg-surface-raised p-4'
          : 'rounded-lg border border-line-subtle bg-surface-raised p-4'
      }
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={
            feito
              ? 'flex size-6 shrink-0 items-center justify-center rounded-full bg-success text-white'
              : 'flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-muted font-mono text-xs text-content-muted'
          }
        >
          {feito ? <Check className="size-3.5" aria-hidden /> : numero}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-medium text-content">{passo.titulo}</h2>
            {/* O estado vai em texto, não só na cor do círculo. */}
            {feito && <Badge tone="success">feito</Badge>}
            {atual && !feito && <Badge tone="brand">você está aqui</Badge>}
            {passo.quem === 'plataforma' && <Badge tone="neutral">a plataforma faz</Badge>}
          </div>

          <p className="mt-1 text-sm text-content">{passo.oQueFazer}</p>

          {/*
            O "por quê" é o que separa tutorial de lista de cliques. Quem
            entende por que a venda nasce rascunho não precisa decorar que
            precisa confirmar.
          */}
          <p className="mt-1 text-sm text-content-muted">{passo.porQue}</p>

          {passo.pendencia !== undefined && (
            <div className="mt-3 rounded-md bg-warning-soft px-3 py-2">
              <p className="flex items-start gap-1.5 text-sm text-warning">
                <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  <strong>{passo.pendencia.texto}</strong>
                </span>
              </p>
              <p className="mt-1 pl-5 text-xs text-content-muted">{passo.pendencia.contorno}</p>
            </div>
          )}

          {passo.href !== null && (
            <Link
              href={passo.href}
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-content-accent hover:underline"
            >
              {feito ? 'Abrir' : 'Fazer agora'}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

function Externo({ titulo, detalhe }: { titulo: string; detalhe: string }) {
  return (
    <div className="flex items-start gap-2">
      <Sparkles className="mt-0.5 size-4 shrink-0 text-content-subtle" aria-hidden />
      <span>
        <strong className="block text-content">{titulo}</strong>
        <span className="text-content-muted">{detalhe}</span>
      </span>
    </div>
  );
}
