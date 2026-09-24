'use client';

import { AlertTriangle, CheckCircle2, Copy, Loader2 } from 'lucide-react';
import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { PLAN_CODES, SYSTEM_ROLE_CODES, type PlanCode, type TenantStatus } from '@tivexy/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Campo, CampoSelecao } from '@/components/ui/field';

import { convidarUsuario, editarCliente, mudarEstado, trocarPlano } from './actions';
import {
  CICLO_INICIAL,
  CONVITE_ADMIN_INICIAL,
  EDICAO_INICIAL,
  PAPEL_LABEL,
  PLANO_INICIAL,
} from './state';

function Enviar({ rotulo, variante }: { rotulo: string; variante?: 'danger' | 'outline' }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variante} disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Salvando…
        </>
      ) : (
        rotulo
      )}
    </Button>
  );
}

/* ── Editar os dados ───────────────────────────────────────────────────── */

export function EditarCliente({
  slug,
  nome,
  razaoSocial,
  documento,
  fuso,
}: {
  slug: string;
  nome: string;
  razaoSocial: string | null;
  documento: string | null;
  fuso: string;
}) {
  const [estado, acao] = useActionState(editarCliente, EDICAO_INICIAL);

  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />

      {estado.erro !== null && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {estado.erro}
        </p>
      )}
      {estado.salvo && (
        <p role="status" className="flex items-center gap-1.5 text-sm text-success">
          <CheckCircle2 className="size-4" aria-hidden />
          Dados salvos.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo nome="name" rotulo="Nome" obrigatorio padrao={nome} erro={estado.campos.name} />
        <Campo nome="legal_name" rotulo="Razão social" padrao={razaoSocial ?? undefined} />
        <Campo
          nome="document"
          rotulo="CNPJ ou CPF"
          padrao={documento ?? undefined}
          erro={estado.campos.document}
          dica="Pode colar com pontuação."
        />
        <Campo
          nome="timezone"
          rotulo="Fuso horário"
          padrao={fuso}
          erro={estado.campos.timezone}
          dica="Decide o que é “hoje” em relatório e “atrasado” na agenda."
        />
      </div>

      <div>
        <Enviar rotulo="Salvar" />
      </div>

      {/*
        O endereço não é editável aqui, e a ausência é deliberada — ver o
        comentário na página. Dizer por que é melhor do que deixar a pessoa
        procurando o campo.
      */}
      <p className="text-xs text-content-subtle">
        O endereço <strong>{slug}.tivexy.com.br</strong> não muda por esta tela: ele está em links
        guardados, em e-mails já enviados e é por onde a requisição descobre de quem ela é.
      </p>
    </form>
  );
}

/* ── Suspender, reativar, cancelar ─────────────────────────────────────── */

/** As transições que a função do banco aceita, escritas do lado de cá também. */
const DESTINOS: Record<TenantStatus, { destino: TenantStatus; rotulo: string; perigo: boolean }[]> =
  {
    active: [
      { destino: 'suspended', rotulo: 'Suspender', perigo: false },
      { destino: 'cancelled', rotulo: 'Cancelar cliente', perigo: true },
    ],
    suspended: [
      { destino: 'active', rotulo: 'Reativar', perigo: false },
      { destino: 'cancelled', rotulo: 'Cancelar cliente', perigo: true },
    ],
    /* Um cliente pela metade não se suspende: se desfaz, e desfazer é a
       compensação do provisionamento, que vive na lista de falhas. */
    provisioning: [],
    /* Terminal. Ressuscitar não é troca de estado. */
    cancelled: [],
  };

export function CicloDeVida({ slug, estado }: { slug: string; estado: TenantStatus }) {
  const [resultado, acao] = useActionState(mudarEstado, CICLO_INICIAL);
  const [confirmando, setConfirmando] = useState<TenantStatus | null>(null);
  const opcoes = DESTINOS[estado];

  if (opcoes.length === 0) {
    return (
      <p className="text-sm text-content-muted">
        {estado === 'provisioning'
          ? 'Cliente em provisionamento. Retomar ou desfazer está na lista de falhas, na página anterior.'
          : 'Cliente cancelado. Reabrir é decisão que não se toma por um botão nesta tela.'}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {resultado.erro !== null && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {resultado.erro}
        </p>
      )}
      {resultado.agora !== null && (
        <p role="status" className="flex items-center gap-1.5 text-sm text-success">
          <CheckCircle2 className="size-4" aria-hidden />O cliente está {resultado.agora}.
        </p>
      )}

      {opcoes.map((opcao) => (
        <form key={opcao.destino} action={acao} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="destino" value={opcao.destino} />

          {confirmando === opcao.destino ? (
            <>
              <div className="min-w-0 flex-1">
                <Campo
                  nome="motivo"
                  rotulo={`Motivo — ${opcao.rotulo.toLowerCase()}`}
                  dica="Fica na auditoria. Quem ler daqui a seis meses precisa entender."
                />
              </div>
              <Enviar rotulo="Confirmar" variante={opcao.perigo ? 'danger' : 'outline'} />
              <Button type="button" variant="ghost" onClick={() => setConfirmando(null)}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant={opcao.perigo ? 'danger' : 'outline'}
              onClick={() => setConfirmando(opcao.destino)}
            >
              {opcao.perigo && <AlertTriangle aria-hidden />}
              {opcao.rotulo}
            </Button>
          )}
        </form>
      ))}
    </div>
  );
}

/* ── Trocar de plano ───────────────────────────────────────────────────── */

export function TrocarPlano({ slug, atual }: { slug: string; atual: PlanCode | null }) {
  const [estado, acao] = useActionState(trocarPlano, PLANO_INICIAL);

  return (
    <form action={acao} className="flex flex-col gap-3">
      <input type="hidden" name="slug" value={slug} />

      {estado.erro !== null && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {estado.erro}
        </p>
      )}
      {estado.resultado !== null && (
        <p role="status" className="rounded-md bg-success-soft px-3 py-2 text-sm text-success">
          Agora é <strong>{estado.resultado.plano}</strong>. {estado.resultado.habilitados}{' '}
          {estado.resultado.habilitados === 1 ? 'módulo habilitado' : 'módulos habilitados'}
          {estado.resultado.desabilitados > 0 &&
            `, ${estado.resultado.desabilitados} desabilitados — os dados continuam lá`}
          .
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48">
          <CampoSelecao
            nome="plano"
            rotulo="Plano"
            obrigatorio
            padrao={atual ?? undefined}
            opcoes={PLAN_CODES.map((codigo) => ({ valor: codigo, texto: codigo }))}
          />
        </div>
        <Enviar rotulo="Trocar" variante="outline" />
      </div>

      <p className="text-xs text-content-subtle">
        Rebaixar <strong>desabilita</strong> os módulos que saíram — nunca apaga. O dado continua
        sendo do cliente, e voltar ao plano maior reacende tudo como estava.
      </p>
    </form>
  );
}

/* ── Convidar alguém ───────────────────────────────────────────────────── */

export function ConvidarUsuario({ slug }: { slug: string }) {
  const [estado, acao] = useActionState(convidarUsuario, CONVITE_ADMIN_INICIAL);
  const primeiro = useRef<HTMLInputElement>(null);

  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />

      {estado.erro !== null && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {estado.erro}
        </p>
      )}

      {estado.criado !== null && <ConviteCriado {...estado.criado} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          nome="email"
          rotulo="E-mail"
          tipo="email"
          obrigatorio
          referencia={primeiro}
          erro={estado.campos.email}
          placeholder="pessoa@cliente.com.br"
        />
        <Campo
          nome="nome"
          rotulo="Nome"
          obrigatorio
          erro={estado.campos.nome}
          placeholder="Maria Souza"
        />
        <CampoSelecao
          nome="papel"
          rotulo="Papel"
          obrigatorio
          padrao="collaborator"
          erro={estado.campos.papel}
          opcoes={SYSTEM_ROLE_CODES.map((codigo) => ({
            valor: codigo,
            texto: PAPEL_LABEL[codigo],
          }))}
        />
      </div>

      <div>
        <Enviar rotulo="Criar convite" variante="outline" />
      </div>
    </form>
  );
}

/**
 * O que aparece depois de criar o convite.
 *
 * **Diz que nenhum e-mail foi enviado.** Não é ressalva de rodapé: sem SMTP
 * próprio, o convite não sai, e uma tela dizendo "convite enviado" faria o
 * Super Admin esperar por um e-mail que nunca chega — e o cliente também.
 */
function ConviteCriado({
  email,
  link,
  jaExistia,
}: {
  email: string;
  link: string | null;
  jaExistia: boolean;
}) {
  const [copiado, setCopiado] = useState(false);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-warning/30 bg-warning-soft/40 p-4">
      <p className="flex items-center gap-2 text-sm text-content">
        <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
        Convite criado para <strong>{email}</strong>
        {jaExistia && <Badge tone="neutral">conta já existia</Badge>}
      </p>

      <p className="text-sm text-warning">
        <strong>Nenhum e-mail foi enviado.</strong> O projeto ainda usa o servidor embutido do
        Supabase, que não entrega para fora da equipe. Repasse o link abaixo pelo canal que você já
        usa com o cliente.
      </p>

      {link === null ? (
        <p className="text-sm text-content-muted">
          Não consegui gerar o link agora. A conta e o convite existem — gere o link pela lista de
          clientes.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1.5 font-mono text-xs text-content">
            {link}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(() => setCopiado(true));
            }}
          >
            <Copy aria-hidden />
            {copiado ? 'Copiado' : 'Copiar'}
          </Button>
        </div>
      )}

      <p className="text-xs text-content-subtle">
        O link <strong>é credencial</strong>: quem abrir entra como essa conta. Vale uma vez e
        vence. Ele não fica gravado em lugar nenhum — se sair desta tela, gere outro.
      </p>
    </div>
  );
}
