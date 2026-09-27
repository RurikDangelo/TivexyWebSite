import { CircleCheck, CircleDashed, CircleHelp, Lock, Wrench } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import { type DadosDaEmpresa, type Integracao, conferir } from '@/lib/integrations/catalog';

/**
 * Uma integração, do jeito que ela está: não configurada.
 *
 * Sem botão de conectar — não há conexão possível ainda, e um botão que não
 * conecta seria a simulação que o projeto proíbe. O que a tela oferece é o
 * que falta, separado por quem precisa fazer: a empresa (🔒 externo) ou a
 * Tivexy (interno).
 *
 * O selo é `BLOCKED — EXTERNAL` em todas as sete, e não "em breve": cada uma
 * depende de conta, credencial, contrato ou aprovação de um terceiro — Meta,
 * SEFAZ, banco, adquirente, provedor de SMTP, OpenAI. É a classificação que o
 * CLAUDE.md exige para tarefa externa, e ela impede que a tela seja lida como
 * backlog interno com data.
 */
export function IntegrationCard({
  integracao,
  modulo,
  empresa,
  conferenciaDisponivel,
  atraso,
}: {
  integracao: Integracao;
  /** O módulo de que depende, com o nome do catálogo e se a empresa contratou. */
  modulo: { nome: string; contratado: boolean } | null;
  empresa: DadosDaEmpresa;
  /**
   * A leitura da empresa deu certo. Falso, as checagens não podem dizer "ainda
   * não": ninguém olhou. Ver o comentário em `page.tsx`.
   */
  conferenciaDisponivel: boolean;
  atraso: string;
}) {
  const i = integracao;
  const dependeDaEmpresa = i.faltaDaEmpresa.length > 0;

  return (
    <Card className="animate-enter" style={{ animationDelay: atraso }}>
      <CardHeader>
        <CardTitle>{i.nome}</CardTitle>
        <CardDescription>{i.paraQue}</CardDescription>
        <CardAction>
          <Badge tone="warning" Icone={Lock}>
            BLOCKED — EXTERNAL
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <p className="text-caption text-content-subtle">
          Não configurado.{' '}
          {dependeDaEmpresa
            ? 'Depende da empresa e da Tivexy — as duas listas abaixo.'
            : 'Depende só da Tivexy: nada a fazer do lado da empresa.'}
        </p>

        <p className="rounded-control bg-surface-sunken px-3 py-2 text-body text-content-default">
          <span className="font-medium text-content">Hoje, sem isso: </span>
          {i.hojeSemEla}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <section
            aria-label={`O que falta da empresa — ${i.nome}`}
            className="flex flex-col gap-1.5"
          >
            <SectionLabel Icone={Lock}>Da empresa · externo</SectionLabel>
            {i.faltaDaEmpresa.length === 0 ? (
              <p className="text-body text-content-muted">
                Nada — {i.modulo === null ? 'é configuração da plataforma' : 'basta o módulo'}.
              </p>
            ) : (
              <Pendencias itens={i.faltaDaEmpresa} />
            )}
            {i.checagens.length > 0 && (
              <ul className="mt-1 flex flex-col gap-1 text-body">
                {i.checagens.map((c) => {
                  const r = conferir(c, empresa);
                  /*
                   * Três estados, não dois: pronto, ainda não, e "não consegui
                   * conferir". O terceiro existe porque `conferir()` devolve
                   * `false` tanto para o campo vazio quanto para a leitura que
                   * falhou, e só a tela sabe a diferença.
                   */
                  if (!conferenciaDisponivel) {
                    return (
                      <li key={c} className="flex items-center gap-2">
                        <CircleHelp className="size-4 shrink-0 text-content-subtle" aria-hidden />
                        <span className="text-content-muted">{r.texto}: não consegui conferir</span>
                      </li>
                    );
                  }
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

          <section
            aria-label={`O que falta da Tivexy — ${i.nome}`}
            className="flex flex-col gap-1.5"
          >
            <SectionLabel Icone={Wrench}>Da Tivexy · interno</SectionLabel>
            <Pendencias itens={i.faltaDaTivexy} />
          </section>
        </div>

        {modulo !== null && (
          <p className="text-caption text-content-subtle">
            Módulo {modulo.nome}:{' '}
            {modulo.contratado ? 'contratado' : 'não contratado nesta empresa'}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** A lista do que falta. Marcador desenhado à mão para o traço não virar texto no leitor de tela. */
function Pendencias({ itens }: { itens: readonly string[] }) {
  return (
    <ul className="flex flex-col gap-1 text-body text-content-default">
      {itens.map((f) => (
        <li key={f} className="flex gap-2">
          <span aria-hidden className="text-content-subtle">
            –
          </span>
          <span className="min-w-0">{f}</span>
        </li>
      ))}
    </ul>
  );
}
