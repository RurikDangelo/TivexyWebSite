'use client';

import { Check, Copy, KeyRound, Link2, Trash2, UserPlus, X } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';

import { Field, describedBy } from '@/components/form/field';
import { FormError, FormSuccess } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';

import {
  convidarPessoa,
  gerarLinkDeNovo,
  mudarPapel,
  mudarSituacao,
  removerPessoa,
} from './actions';
import { EQUIPE_INICIAL, type EquipeState, type MembroNaTela, type Papel } from './state';

/**
 * O link de acesso, uma vez, com o aviso do que ele é.
 *
 * Não é guardado em lugar nenhum: fechar a caixa é perdê-lo, e gerar outro
 * invalida este. É o mesmo cuidado do Super Admin.
 */
function LinkDeAcesso({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div
      role="status"
      className="animate-enter flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3"
    >
      <p className="flex items-start gap-2 text-sm text-content">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <span>
          <strong className="font-medium">Este link é credencial.</strong> Quem abrir entra como
          essa pessoa. Vale uma vez e vence — mande só para ela.
        </span>
      </p>
      <div className="flex gap-2">
        <Label htmlFor="link-acesso" className="sr-only">
          Link de acesso
        </Label>
        <Input
          id="link-acesso"
          readOnly
          value={link}
          className="font-mono text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopiado(true);
          }}
        >
          {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copiado ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
    </div>
  );
}

function Retorno({ estado }: { estado: EquipeState }) {
  return (
    <>
      {estado.erro ? <FormError>{estado.erro}</FormError> : null}
      {estado.ok !== null && <FormSuccess>{estado.ok}</FormSuccess>}
      {estado.link !== null && <LinkDeAcesso link={estado.link} />}
    </>
  );
}

export function InviteForm({ papeis }: { papeis: readonly Papel[] }) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao] = useActionState(convidarPessoa, EQUIPE_INICIAL);
  const formulario = useRef<HTMLFormElement>(null);
  const e = estado.campos;
  const padrao = papeis.find((p) => p.nome === 'Colaborador')?.id ?? papeis[0]?.id;

  useEffect(() => {
    if (estado.ok !== null) formulario.current?.reset();
  }, [estado.ok]);

  if (!aberto) {
    return (
      <div className="flex flex-col gap-3">
        <div>
          <Button onClick={() => setAberto(true)}>
            <UserPlus aria-hidden />
            Convidar pessoa
          </Button>
        </div>
        <Retorno estado={estado} />
      </div>
    );
  }

  return (
    <form
      ref={formulario}
      action={acao}
      className="animate-enter flex flex-col gap-4 rounded-lg border border-line-subtle bg-surface-raised p-4 shadow-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-medium text-content">Convidar pessoa</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Fechar convite"
          onClick={() => setAberto(false)}
        >
          <X aria-hidden />
        </Button>
      </div>
      <p className="text-sm text-content-muted">
        O convite não sai por e-mail ainda. Para conta nova, você recebe o link de acesso e o
        repassa pelo canal que já usa com a pessoa.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field nome="email" rotulo="E-mail" obrigatorio erro={e.email}>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="pessoa@empresa.com.br"
            aria-invalid={e.email !== undefined}
            aria-describedby={describedBy('email', e.email)}
          />
        </Field>
        <Field nome="nome" rotulo="Nome" erro={e.nome} dica="Obrigatório para conta nova.">
          <Input
            id="nome"
            name="nome"
            autoComplete="off"
            maxLength={120}
            aria-invalid={e.nome !== undefined}
            aria-describedby={describedBy('nome', e.nome, 'Obrigatório para conta nova.')}
          />
        </Field>
        <Field nome="papel" rotulo="Papel" obrigatorio erro={e.papel}>
          <Select
            id="papel"
            name="papel"
            required
            defaultValue={padrao}
            aria-invalid={e.papel !== undefined}
          >
            {papeis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Submit pendente="Convidando…">Convidar</Submit>
        <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  );
}

const SITUACAO: Record<
  MembroNaTela['status'],
  { rotulo: string; tom: 'success' | 'warning' | 'neutral' }
> = {
  active: { rotulo: 'Com acesso', tom: 'success' },
  invited: { rotulo: 'Convite pendente', tom: 'warning' },
  suspended: { rotulo: 'Acesso suspenso', tom: 'neutral' },
};

/**
 * Uma pessoa da equipe e o que se pode fazer com ela.
 *
 * Na própria linha, só o papel aparece — e sem ações destrutivas: tirar a si
 * mesmo da empresa pela tela é o engano que ninguém queria cometer, e quem
 * precisa sair pede a outra pessoa administradora.
 */
export function MemberRow({
  membro,
  papeis,
  podeEditar,
}: {
  membro: MembroNaTela;
  papeis: readonly Papel[];
  podeEditar: boolean;
}) {
  const [papelEstado, papelAcao] = useActionState(mudarPapel, EQUIPE_INICIAL);
  const [situacaoEstado, situacaoAcao] = useActionState(mudarSituacao, EQUIPE_INICIAL);
  const [remocaoEstado, remocaoAcao] = useActionState(removerPessoa, EQUIPE_INICIAL);
  const [linkEstado, linkAcao] = useActionState(gerarLinkDeNovo, EQUIPE_INICIAL);
  const situacao = SITUACAO[membro.status];
  const idPapel = `papel-${membro.vinculoId}`;

  return (
    <li className="flex flex-col gap-3 border-b border-line-subtle p-4 last:border-b-0">
      {/* No celular, o papel desce para a linha de baixo: lado a lado, o seletor cobria o nome. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar nome={membro.nome} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-content">
              <span className="min-w-0 break-words">{membro.nome}</span>
              {membro.voce && <Badge tone="brand">Você</Badge>}
              <Badge tone={situacao.tom}>{situacao.rotulo}</Badge>
            </p>
            <p className="truncate text-sm text-content-muted">
              {[membro.email, membro.desde !== null ? `desde ${membro.desde}` : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>

        {podeEditar ? (
          <form action={papelAcao} className="flex items-center gap-1.5 sm:shrink-0">
            <input type="hidden" name="vinculo" value={membro.vinculoId} />
            <Label htmlFor={idPapel} className="sr-only">
              Papel de {membro.nome}
            </Label>
            <Select
              id={idPapel}
              name="papel"
              defaultValue={membro.papelId}
              className="h-8 flex-1 sm:w-40 sm:flex-none"
            >
              {papeis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
            <Submit
              variant="ghost"
              size="icon"
              className="size-8"
              pendente=""
              aria-label={`Salvar papel de ${membro.nome}`}
            >
              <Check aria-hidden />
            </Submit>
          </form>
        ) : (
          <Badge className="self-start sm:self-center">{membro.papel}</Badge>
        )}
      </div>

      {podeEditar && !membro.voce && (
        <div className="flex flex-wrap items-center gap-2 sm:pl-12">
          {membro.status === 'invited' && (
            <form action={linkAcao}>
              <input type="hidden" name="vinculo" value={membro.vinculoId} />
              <Submit variant="outline" size="sm" pendente="Gerando…">
                <Link2 aria-hidden />
                Gerar link de novo
              </Submit>
            </form>
          )}
          {membro.status !== 'invited' && (
            <form action={situacaoAcao}>
              <input type="hidden" name="vinculo" value={membro.vinculoId} />
              <input
                type="hidden"
                name="para"
                value={membro.status === 'suspended' ? 'active' : 'suspended'}
              />
              <Submit variant="outline" size="sm" pendente="…">
                {membro.status === 'suspended' ? 'Reativar acesso' : 'Suspender acesso'}
              </Submit>
            </form>
          )}
          <form
            action={remocaoAcao}
            onSubmit={(ev) => {
              const pergunta =
                membro.status === 'invited'
                  ? `Cancelar o convite de ${membro.nome}?`
                  : `Tirar ${membro.nome} da equipe? A conta continua existindo; o acesso a esta empresa acaba.`;
              if (!window.confirm(pergunta)) ev.preventDefault();
            }}
          >
            <input type="hidden" name="vinculo" value={membro.vinculoId} />
            <Submit variant="ghost" size="sm" pendente="…" className="text-danger">
              <Trash2 aria-hidden />
              {membro.status === 'invited' ? 'Cancelar convite' : 'Remover'}
            </Submit>
          </form>
        </div>
      )}

      {[papelEstado, situacaoEstado, remocaoEstado, linkEstado].map((estado, i) =>
        estado.erro || estado.ok !== null || estado.link !== null ? (
          <div key={i} className="sm:pl-12">
            <Retorno estado={estado} />
          </div>
        ) : null,
      )}
    </li>
  );
}
