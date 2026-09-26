import { Clock } from 'lucide-react';
import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireSession } from '@/lib/auth/require';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * O motivo que a plataforma gravou ao suspender — o texto que a empresa lê.
 * A linha da própria empresa continua legível para quem é dela, suspensa ou
 * não (`tenants_read`); o que a suspensão corta é o dado de negócio.
 */
async function motivoDaSuspensao(tenantId: string): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('tenants')
    .select('status_reason')
    .eq('id', tenantId)
    .maybeSingle();
  const motivo = (data as { status_reason?: unknown } | null)?.status_reason;
  return typeof motivo === 'string' && motivo.trim() !== '' ? motivo : null;
}

export const metadata: Metadata = { title: 'Preparando' };

/*
 * A empresa existe e não opera: `provisioning`, `suspended` ou `cancelled`.
 *
 * Os três têm textos diferentes porque o próximo passo é diferente em cada um —
 * esperar, falar com o financeiro, falar com o comercial. Um texto genérico
 * transferiria essa triagem para o suporte.
 *
 * A página não recarrega sozinha. Um provisionamento leva segundos, e uma tela
 * que se atualiza a cada cinco segundos produz mais requisição do que utilidade.
 * Quando houver acompanhamento de etapa — as linhas de `provisioning_steps` já
 * existem —, é aqui que ele entra.
 */
const TEXTO = {
  provisioning: {
    titulo: 'Estamos preparando sua empresa',
    descricao: 'A configuração inicial está em andamento. Isso costuma levar poucos minutos.',
    passo: 'Atualize a página em instantes. Se passar de meia hora, fale com quem contratou.',
  },
  suspended: {
    titulo: 'Acesso suspenso',
    descricao: 'O acesso desta empresa está suspenso no momento. Os dados continuam guardados.',
    passo: 'Para regularizar, fale com quem contratou a Tivexy pela empresa.',
  },
  cancelled: {
    titulo: 'Conta encerrada',
    descricao: 'Esta empresa não está mais ativa na Tivexy.',
    passo: 'Se isso não era esperado, fale com quem contratou o serviço.',
  },
} as const;

export default async function PreparandoPage() {
  const { choice } = await requireSession();
  const empresa = choice.kind === 'resolved' ? choice.tenant : null;
  const estado = empresa?.status ?? 'provisioning';
  const texto = estado in TEXTO ? TEXTO[estado as keyof typeof TEXTO] : TEXTO.provisioning;
  const motivo =
    empresa !== null && estado === 'suspended' ? await motivoDaSuspensao(empresa.id) : null;

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <Card>
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-surface-muted">
            <Clock className="size-5 text-content-subtle" aria-hidden />
          </div>
          <CardTitle className="text-xl">{texto.titulo}</CardTitle>
          <CardDescription>{texto.descricao}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {empresa !== null && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-content-muted">{empresa.name}</span>
              <Badge tone={estado === 'provisioning' ? 'warning' : 'neutral'}>{estado}</Badge>
            </div>
          )}
          {motivo !== null && (
            <p className="rounded-md border border-line-subtle px-3 py-2 text-sm text-content-default">
              <span className="font-medium">Motivo informado pela Tivexy: </span>
              {motivo}
            </p>
          )}
          <p className="rounded-md bg-surface-subtle px-3 py-2 text-sm text-content-muted">
            {texto.passo}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
