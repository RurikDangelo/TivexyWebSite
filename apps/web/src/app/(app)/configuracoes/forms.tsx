'use client';

import { Check, Plus, Trash2 } from 'lucide-react';
import { useActionState, useEffect, useRef } from 'react';

import { Field, describedBy } from '@/components/form/field';
import { FormError, FormSuccess } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

import { criarTipo, excluirTipo, renomearTipo, salvarEmpresa, salvarPreferencias } from './actions';
import { CONFIG_INICIAL, type ConfigState } from './state';

function Retorno({ estado }: { estado: ConfigState }) {
  if (estado.erro) return <FormError>{estado.erro}</FormError>;
  if (estado.ok !== null) return <FormSuccess>{estado.ok}</FormSuccess>;
  return null;
}

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
      <fieldset disabled={!podeEditar} className="grid gap-4 sm:grid-cols-2">
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
          <Retorno estado={estado} />
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
      {estado.erro && <FormError>{estado.erro}</FormError>}
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
                className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor={item.chave}>{item.rotulo}</Label>
                    {mudada && <Badge tone="brand">Alterada</Badge>}
                  </div>
                  <p id={idDica} className="mt-0.5 text-sm text-content-muted">
                    {item.descricao}
                  </p>
                  {erro !== undefined && (
                    <p role="alert" className="mt-1 text-xs text-danger">
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
          {estado.ok !== null && <FormSuccess>{estado.ok}</FormSuccess>}
        </div>
      )}
    </form>
  );
}

function TipoLinha({ id, nome, podeEditar }: { id: string; nome: string; podeEditar: boolean }) {
  const [renomeado, renomearAcao] = useActionState(renomearTipo, CONFIG_INICIAL);
  const [excluido, excluirAcao] = useActionState(excluirTipo, CONFIG_INICIAL);

  if (!podeEditar) return <li className="py-2 text-sm text-content">{nome}</li>;

  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex items-center gap-1.5">
        <form action={renomearAcao} className="flex min-w-0 flex-1 items-center gap-1.5">
          <input type="hidden" name="id" value={id} />
          <Label htmlFor={`tipo-${id}`} className="sr-only">
            Nome do tipo {nome}
          </Label>
          <Input
            id={`tipo-${id}`}
            name="nome"
            defaultValue={nome}
            required
            maxLength={60}
            className="h-8"
          />
          <Submit
            variant="ghost"
            size="icon"
            className="size-8"
            pendente=""
            aria-label={`Salvar o nome de ${nome}`}
          >
            <Check aria-hidden />
          </Submit>
        </form>
        <form
          action={excluirAcao}
          onSubmit={(ev) => {
            if (!window.confirm(`Excluir "${nome}"? As atividades desse tipo ficam sem tipo.`)) {
              ev.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={id} />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Excluir ${nome}`}
          >
            <Trash2 aria-hidden />
          </Button>
        </form>
      </div>
      {renomeado.erro && <FormError>{renomeado.erro}</FormError>}
      {excluido.erro && <FormError>{excluido.erro}</FormError>}
    </li>
  );
}

export function TiposDeAtividade({
  tipos,
  podeEditar,
  plural,
}: {
  tipos: readonly { id: string; nome: string }[];
  podeEditar: boolean;
  plural: string;
}) {
  const [estado, acao] = useActionState(criarTipo, CONFIG_INICIAL);
  const formulario = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.ok !== null) formulario.current?.reset();
  }, [estado.ok]);

  return (
    <div className="flex flex-col gap-4">
      {tipos.length === 0 ? (
        <p className="text-sm text-content-muted">
          Ainda não há tipos. Sem eles, {plural} ficam &ldquo;sem tipo&rdquo; — funciona, mas não dá
          para separar uma coisa da outra na agenda.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line-subtle">
          {tipos.map((t) => (
            <TipoLinha key={t.id} id={t.id} nome={t.nome} podeEditar={podeEditar} />
          ))}
        </ul>
      )}
      {podeEditar && (
        <form ref={formulario} action={acao} className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label htmlFor="novo-tipo">Novo tipo</Label>
              <Input id="novo-tipo" name="nome" required maxLength={60} placeholder="Visita" />
            </div>
            <Submit variant="outline">
              <Plus aria-hidden />
              Adicionar
            </Submit>
          </div>
          {estado.campos.nome !== undefined && <FormError>{estado.campos.nome}</FormError>}
          <Retorno estado={{ ...estado, campos: {} }} />
        </form>
      )}
    </div>
  );
}
