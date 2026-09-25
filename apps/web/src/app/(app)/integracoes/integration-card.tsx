import { CircleCheck, CircleDashed, Lock, Wrench } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { type DadosDaEmpresa, type Integracao, conferir } from '@/lib/integrations/catalog';

/**
 * Uma integração, do jeito que ela está: não configurada.
 *
 * Sem botão de conectar — não há conexão possível ainda, e um botão que não
 * conecta seria a simulação que o projeto proíbe. O que a tela oferece é o
 * que falta, separado por quem precisa fazer: a empresa (🔒 externo) ou a
 * Tivexy (interno).
 */
export function IntegrationCard({
  integracao,
  modulo,
  empresa,
}: {
  integracao: Integracao;
  /** O módulo de que depende, com o nome do catálogo e se a empresa contratou. */
  modulo: { nome: string; contratado: boolean } | null;
  empresa: DadosDaEmpresa;
}) {
  const i = integracao;
  const tituloId = `integracao-${i.codigo}`;
  return (
    <Card className="animate-enter">
      <CardContent className="flex flex-col gap-4 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2
              id={tituloId}
              className="font-sans text-base font-semibold tracking-normal text-content"
            >
              {i.nome}
            </h2>
            <p className="mt-0.5 text-sm text-content-muted">{i.paraQue}</p>
          </div>
          <Badge>
            <CircleDashed className="size-3" aria-hidden />
            Não configurado
          </Badge>
        </div>

        <p className="rounded-md bg-surface-subtle px-3 py-2 text-sm text-content-default">
          <span className="font-medium">Hoje, sem isso: </span>
          {i.hojeSemEla}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <section aria-label={`O que falta da empresa — ${i.nome}`}>
            <h3 className="mb-1.5 flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-content-subtle">
              <Lock className="size-3.5" aria-hidden />
              Da empresa · externo
            </h3>
            {i.faltaDaEmpresa.length === 0 ? (
              <p className="text-sm text-content-muted">
                Nada — {i.modulo === null ? 'é configuração da plataforma' : 'basta o módulo'}.
              </p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm text-content-default">
                {i.faltaDaEmpresa.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span aria-hidden className="text-content-subtle">
                      –
                    </span>
                    <span className="min-w-0">{f}</span>
                  </li>
                ))}
              </ul>
            )}
            {i.checagens.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {i.checagens.map((c) => {
                  const r = conferir(c, empresa);
                  return (
                    <li key={c} className="flex items-center gap-2">
                      {r.pronto ? (
                        <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
                      ) : (
                        <CircleDashed className="size-4 shrink-0 text-content-subtle" aria-hidden />
                      )}
                      <span className={r.pronto ? 'text-content-default' : 'text-content-muted'}>
                        {r.texto}: {r.pronto ? 'pronto' : 'ainda não'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-label={`O que falta da Tivexy — ${i.nome}`}>
            <h3 className="mb-1.5 flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-content-subtle">
              <Wrench className="size-3.5" aria-hidden />
              Da Tivexy · interno
            </h3>
            <ul className="flex flex-col gap-1 text-sm text-content-default">
              {i.faltaDaTivexy.map((f) => (
                <li key={f} className="flex gap-2">
                  <span aria-hidden className="text-content-subtle">
                    –
                  </span>
                  <span className="min-w-0">{f}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {modulo !== null && (
          <p className="text-xs text-content-subtle">
            Módulo {modulo.nome}:{' '}
            {modulo.contratado ? 'contratado' : 'não contratado nesta empresa'}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
