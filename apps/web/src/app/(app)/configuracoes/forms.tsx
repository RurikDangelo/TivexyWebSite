'use client';

import { useActionState } from 'react';

import { Field, describedBy } from '@/components/form/field';
import { FormError, FormFeedback } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

import { salvarEmpresa, salvarPreferencias } from './actions';
import { CONFIG_INICIAL } from './state';

export function EmpresaForm({
  inicial,
  podeEditar,
}: {
  inicial: { nome: string; razaoSocial: string | null; documento: string | null };
  podeEditar: boolean;
}) {
  const [estado, acao] = useActionState(salvarEmpresa, CONFIG_INICIAL);
  const e = estado.campos;
  const dica = 'CNPJ — inclusive o novo, com letras — ou CPF.';

  return (
    <form action={acao} className="flex flex-col gap-4">
      <fieldset disabled={!podeEditar} className="grid gap-3 sm:grid-cols-2">
        <Field nome="nome" rotulo="Nome" obrigatorio erro={e.nome}>
          <Input
            id="nome"
            name="nome"
            required
            maxLength={120}
            defaultValue={inicial.nome}
            aria-invalid={e.nome !== undefined}
            aria-describedby={describedBy('nome', e.nome)}
          />
        </Field>
        <Field nome="razaoSocial" rotulo="Razão social">
          <Input
            id="razaoSocial"
            name="razaoSocial"
            maxLength={200}
            defaultValue={inicial.razaoSocial ?? ''}
          />
        </Field>
        <Field nome="documento" rotulo="CNPJ ou CPF" erro={e.documento} dica={dica}>
          <Input
            id="documento"
            name="documento"
            maxLength={20}
            defaultValue={inicial.documento ?? ''}
            aria-invalid={e.documento !== undefined}
            aria-describedby={describedBy('documento', e.documento, dica)}
          />
        </Field>
      </fieldset>
      {podeEditar && (
        <div className="flex flex-wrap items-center gap-3">
          <Submit>Salvar dados</Submit>
          <FormFeedback estado={estado} />
        </div>
      )}
    </form>
  );
}

export interface PreferenciaNaTela {
  chave: string;
  rotulo: string;
  descricao: string;
  tipo: 'string' | 'boolean' | 'number' | 'enum';
  valor: string | number | boolean;
  padrao: string | number | boolean;
  opcoes?: readonly { valor: string; rotulo: string }[];
}

/**
 * Uma configuração por linha, com o que ela faz escrito embaixo — e se está
 * no padrão ou foi mudada. "Mudada" é informação: responde "isso é assim para
 * todo mundo, ou alguém escolheu?" sem abrir a auditoria.
 */
export function PreferenciasForm({
  itens,
  podeEditar,
}: {
  itens: readonly PreferenciaNaTela[];
  podeEditar: boolean;
}) {
  const [estado, acao] = useActionState(salvarPreferencias, CONFIG_INICIAL);

  return (
    <form action={acao} className="flex flex-col gap-4">
      {estado.erro !== null && <FormError>{estado.erro}</FormError>}
      <fieldset disabled={!podeEditar}>
        <legend className="sr-only">Preferências</legend>
        <ul className="flex flex-col divide-y divide-line-subtle">
          {itens.map((item) => {
            const erro = estado.campos[item.chave];
            const mudada = item.valor !== item.padrao;
            const idDica = `${item.chave}-dica`;
            return (
              <li
                key={item.chave}
                /* `py-3` no lugar de `py-4`: quinze preferências numa tela de 1080p. */
                className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor={item.chave}>{item.rotulo}</Label>
                    {mudada && (
                      <Badge tone="brand" tamanho="xs">
                        Alterada
                      </Badge>
                    )}
                  </div>
                  <p id={idDica} className="mt-0.5 text-caption text-content-muted">
                    {item.descricao}
                  </p>
                  {erro !== undefined && (
                    <p role="alert" className="mt-1 text-caption text-danger">
                      {erro}
                    </p>
                  )}
                </div>
                <div className="shrink-0 sm:pt-0.5">
                  {item.tipo === 'boolean' ? (
                    <Switch
                      id={item.chave}
                      name={item.chave}
                      defaultChecked={item.valor === true}
                      aria-describedby={idDica}
                    />
                  ) : (
                    <Select
                      id={item.chave}
                      name={item.chave}
                      defaultValue={String(item.valor)}
                      aria-describedby={idDica}
                      aria-invalid={erro !== undefined}
                      className="w-full sm:w-72"
                    >
                      {(item.opcoes ?? []).map((o) => (
                        <option key={o.valor} value={o.valor}>
                          {o.rotulo}
                        </option>
                      ))}
                    </Select>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </fieldset>
      {podeEditar && (
        <div className="flex flex-wrap items-center gap-3">
          <Submit>Salvar preferências</Submit>
          {/* Só o sucesso: o erro já aparece acima, antes dos campos que ele descreve. */}
          <FormFeedback estado={{ ok: estado.ok }} />
        </div>
      )}
    </form>
  );
}
