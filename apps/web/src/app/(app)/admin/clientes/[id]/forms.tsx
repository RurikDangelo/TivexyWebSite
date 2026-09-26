'use client';

import { type TenantStatus, previewPlanChange } from '@tivexy/core';
import { useActionState, useState } from 'react';

import { Field, describedBy } from '@/components/form/field';
import { FormError, FormSuccess } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Input, Select, Textarea } from '@/components/ui/input';

import { reativarCliente, salvarCliente, suspenderCliente, trocarPlano } from './actions';
import { CLIENTE_INICIAL, type ModuloNaTela, type PlanoNaTela } from './state';

function Retorno({ erro, ok }: { erro: string | null; ok: string | null }) {
  if (erro !== null) return <FormError>{erro}</FormError>;
  if (ok !== null) return <FormSuccess>{ok}</FormSuccess>;
  return null;
}

/** Nome, razão social e documento. O slug não muda: vira subdomínio, e link enviado quebraria. */
export function DadosForm({
  id,
  nome,
  razaoSocial,
  documento,
}: {
  id: string;
  nome: string;
  razaoSocial: string | null;
  documento: string | null;
}) {
  const [estado, salvar] = useActionState(salvarCliente, CLIENTE_INICIAL);
  const e = estado.campos;
  return (
    <form action={salvar} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field nome="cliente-nome" rotulo="Nome" obrigatorio erro={e.nome}>
          <Input
            id="cliente-nome"
            name="nome"
            defaultValue={nome}
            required
            maxLength={120}
            aria-invalid={e.nome !== undefined}
            aria-describedby={describedBy('cliente-nome', e.nome)}
          />
        </Field>
        <Field nome="cliente-razao" rotulo="Razão social" erro={e.razaoSocial}>
          <Input
            id="cliente-razao"
            name="razaoSocial"
            defaultValue={razaoSocial ?? ''}
            maxLength={200}
            aria-invalid={e.razaoSocial !== undefined}
            aria-describedby={describedBy('cliente-razao', e.razaoSocial)}
          />
        </Field>
        <Field
          nome="cliente-documento"
          rotulo="CNPJ ou CPF"
          erro={e.documento}
          dica="O CNPJ com letras, de 2026, também vale."
        >
          <Input
            id="cliente-documento"
            name="documento"
            defaultValue={documento ?? ''}
            maxLength={20}
            autoComplete="off"
            className="font-mono"
            aria-invalid={e.documento !== undefined}
            aria-describedby={describedBy(
              'cliente-documento',
              e.documento,
              'O CNPJ com letras, de 2026, também vale.',
            )}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Submit variant="outline">Salvar dados</Submit>
        <Retorno erro={estado.erro} ok={estado.ok} />
      </div>
    </form>
  );
}

/**
 * Suspender ou reativar. Suspender pede o motivo — é o texto que a empresa
 * lê em `/preparando` — e pergunta antes: corta o acesso de todo mundo.
 */
export function SituacaoForm({
  id,
  nomeDaEmpresa,
  situacao,
  motivo,
}: {
  id: string;
  nomeDaEmpresa: string;
  situacao: TenantStatus;
  motivo: string | null;
}) {
  const [suspensao, suspender] = useActionState(suspenderCliente, CLIENTE_INICIAL);
  const [reativacao, reativar] = useActionState(reativarCliente, CLIENTE_INICIAL);

  if (situacao === 'active') {
    return (
      <form
        key={suspensao.rodada}
        action={suspender}
        onSubmit={(ev) => {
          if (
            !window.confirm(`Suspender ${nomeDaEmpresa}? Ninguém da empresa entra até reativar.`)
          ) {
            ev.preventDefault();
          }
        }}
        className="flex flex-col gap-3"
      >
        <input type="hidden" name="id" value={id} />
        <Field
          nome="cliente-motivo"
          rotulo="Motivo da suspensão"
          obrigatorio
          dica="A empresa lê este texto quando tenta entrar."
        >
          <Textarea
            id="cliente-motivo"
            name="motivo"
            required
            maxLength={500}
            rows={2}
            placeholder="Pagamento de setembro em aberto."
            aria-describedby={describedBy(
              'cliente-motivo',
              undefined,
              'A empresa lê este texto quando tenta entrar.',
            )}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Submit variant="danger" pendente="Suspendendo…">
            Suspender
          </Submit>
          <Retorno erro={suspensao.erro} ok={reativacao.ok ?? suspensao.ok} />
        </div>
      </form>
    );
  }

  if (situacao === 'suspended') {
    return (
      <form action={reativar} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={id} />
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-content-default">
          <span className="font-medium">Motivo informado: </span>
          {motivo ?? 'nenhum registrado'}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Submit pendente="Reativando…">Reativar</Submit>
          <Retorno erro={reativacao.erro} ok={suspensao.ok ?? reativacao.ok} />
        </div>
      </form>
    );
  }

  return (
    <p className="text-sm text-content-muted">
      {situacao === 'provisioning'
        ? 'Em provisionamento: não se suspende nem reativa. Retome ou desfaça na lista de clientes.'
        : 'Cancelada: não volta por aqui.'}
    </p>
  );
}

/**
 * Trocar o plano, vendo antes o que muda nos módulos — a mesma conta que o
 * banco vai fazer (`previewPlanChange` × `admin_change_plan`, com teste).
 */
export function PlanoForm({
  id,
  planoAtual,
  planos,
  modulos,
}: {
  id: string;
  planoAtual: string | null;
  planos: readonly PlanoNaTela[];
  modulos: readonly ModuloNaTela[];
}) {
  const [estado, trocar] = useActionState(trocarPlano, CLIENTE_INICIAL);
  const outros = planos.filter((p) => p.codigo !== planoAtual);
  const [escolhido, setEscolhido] = useState(outros[0]?.codigo ?? '');
  const [desligar, setDesligar] = useState(false);

  // Depois de trocar, o escolhido pode ser o plano atual, que saiu da lista.
  const valor = outros.some((p) => p.codigo === escolhido) ? escolhido : (outros[0]?.codigo ?? '');
  const plano = planos.find((p) => p.codigo === valor);
  const nome = (codigo: string) => modulos.find((m) => m.codigo === codigo)?.nome ?? codigo;
  const ligados = modulos.filter((m) => m.ligado).map((m) => m.codigo);
  const previa =
    plano === undefined
      ? null
      : previewPlanChange({ planModules: plano.modulos, enabled: ligados, disableOutside: true });
  const foraDoPlano = previa?.disable ?? [];

  if (outros.length === 0) {
    return <p className="text-sm text-content-muted">Não há outro plano à venda.</p>;
  }

  return (
    <form
      action={trocar}
      onSubmit={(ev) => {
        if (!window.confirm(`Trocar para o plano ${plano?.nome ?? valor}?`)) ev.preventDefault();
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="id" value={id} />
      <Field nome="cliente-plano" rotulo="Plano novo" obrigatorio>
        <Select
          id="cliente-plano"
          name="plano"
          value={valor}
          onChange={(ev) => setEscolhido(ev.target.value)}
          className="sm:max-w-xs"
        >
          {outros.map((p) => (
            <option key={p.codigo} value={p.codigo}>
              {p.nome}
            </option>
          ))}
        </Select>
      </Field>

      {previa !== null && (
        <div
          role="status"
          className="flex flex-col gap-1 rounded-md bg-surface-subtle px-3 py-2 text-sm"
        >
          <p>
            <span className="font-medium text-content">Liga: </span>
            <span className="text-content-muted">
              {previa.enable.length === 0
                ? 'nada — já tem tudo'
                : previa.enable.map(nome).join(', ')}
            </span>
          </p>
          <p>
            <span className="font-medium text-content">Fora do plano novo: </span>
            <span className="text-content-muted">
              {foraDoPlano.length === 0 ? 'nada' : foraDoPlano.map(nome).join(', ')}
            </span>
          </p>
        </div>
      )}

      {foraDoPlano.length > 0 && (
        <label className="flex items-start gap-2 text-sm text-content-default">
          <input
            type="checkbox"
            name="desligar"
            checked={desligar}
            onChange={(ev) => setDesligar(ev.target.checked)}
            className="mt-0.5 size-4 accent-[var(--surface-brand)]"
          />
          <span>
            Desligar o que ficou fora do plano ({foraDoPlano.map(nome).join(', ')}). Os dados ficam;
            o acesso sai, e religar devolve tudo. Sem marcar, continuam ligados — como módulo
            vendido à parte.
          </span>
        </label>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Submit variant="outline" pendente="Trocando…">
          Trocar plano
        </Submit>
        <Retorno erro={estado.erro} ok={estado.ok} />
      </div>
    </form>
  );
}
