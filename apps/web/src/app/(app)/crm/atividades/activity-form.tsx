'use client';

import { Plus, X } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';

import { Field, describedBy } from '@/components/form/field';
import { FormError, FormSuccess } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import type { TipoDeAlvo } from '@/lib/crm/activity-input';

import { criarAtividade } from './actions';
import { ATIVIDADE_INICIAL, type Opcao, type OpcoesDeAlvo } from './state';

interface Props {
  singular: string;
  tipos: readonly Opcao[];
  membros: readonly Opcao[];
  /** Hoje no fuso do tenant: o dia sugerido. */
  hoje: string;
  /**
   * Na agenda, o campo "Sobre" oferece tudo, agrupado. Na página de uma
   * pessoa, o alvo já é ela — e o campo vira um texto, não uma escolha.
   */
  alvos?: OpcoesDeAlvo;
  rotulosDosAlvos?: Readonly<Record<TipoDeAlvo, string>>;
  alvoFixo?: { valor: string; nome: string };
}

/**
 * Agendar uma atividade.
 *
 * Recolhido até ser pedido, como os outros cadastros. O dia vem preenchido
 * com hoje, e a hora em branco quer dizer "o dia todo" — ver
 * `lib/crm/activity-input.ts`.
 */
export function NewActivityForm(props: Props) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao] = useActionState(criarAtividade, ATIVIDADE_INICIAL);
  const formulario = useRef<HTMLFormElement>(null);
  const primeiro = useRef<HTMLInputElement>(null);
  const e = estado.campos;

  useEffect(() => {
    if (estado.salvo === null) return;
    formulario.current?.reset();
    primeiro.current?.focus();
  }, [estado.salvo]);

  if (!aberto) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setAberto(true)} variant={props.alvoFixo ? 'outline' : 'brand'}>
          <Plus aria-hidden />
          Agendar {props.singular}
        </Button>
        {estado.salvo !== null && <FormSuccess>{`${estado.salvo} entrou na agenda.`}</FormSuccess>}
      </div>
    );
  }

  const grupos = props.alvos
    ? (Object.entries(props.alvos) as [TipoDeAlvo, readonly Opcao[]][]).filter(
        ([, opcoes]) => opcoes.length > 0,
      )
    : [];

  return (
    <form
      ref={formulario}
      action={acao}
      className="animate-enter rounded-lg border border-line-subtle bg-surface-raised p-4 shadow-xs"
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-medium text-content">Agendar {props.singular}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Fechar agendamento"
          onClick={() => setAberto(false)}
        >
          <X aria-hidden />
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        {estado.erro !== null && <FormError>{estado.erro}</FormError>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            nome="assunto"
            rotulo="Assunto"
            obrigatorio
            erro={e.assunto}
            className="sm:col-span-2"
          >
            <Input
              ref={primeiro}
              id="assunto"
              name="assunto"
              required
              maxLength={200}
              autoComplete="off"
              placeholder="Ligar para confirmar o orçamento"
              aria-invalid={e.assunto !== undefined}
              aria-describedby={describedBy('assunto', e.assunto)}
            />
          </Field>

          {props.alvoFixo !== undefined ? (
            <input type="hidden" name="alvo" value={props.alvoFixo.valor} />
          ) : (
            <Field nome="alvo" rotulo="Sobre" obrigatorio erro={e.alvo} className="sm:col-span-2">
              <Select
                id="alvo"
                name="alvo"
                required
                defaultValue=""
                aria-invalid={e.alvo !== undefined}
                aria-describedby={describedBy('alvo', e.alvo)}
              >
                <option value="" disabled>
                  Escolha…
                </option>
                {grupos.map(([tipo, opcoes]) => (
                  <optgroup key={tipo} label={props.rotulosDosAlvos?.[tipo] ?? tipo}>
                    {opcoes.map((o) => (
                      <option key={o.id} value={`${tipo}:${o.id}`}>
                        {o.nome}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
          )}

          <Field nome="data" rotulo="Dia" erro={e.data}>
            <Input
              id="data"
              name="data"
              type="date"
              defaultValue={props.hoje}
              aria-invalid={e.data !== undefined}
              aria-describedby={describedBy('data', e.data)}
            />
          </Field>

          <Field nome="hora" rotulo="Hora" erro={e.hora} dica="Em branco: o dia todo.">
            <Input
              id="hora"
              name="hora"
              type="time"
              aria-invalid={e.hora !== undefined}
              aria-describedby={describedBy('hora', e.hora, 'Em branco: o dia todo.')}
            />
          </Field>

          {props.tipos.length > 0 && (
            <Field nome="tipo" rotulo="Tipo">
              <Select id="tipo" name="tipo" defaultValue="">
                <option value="">Sem tipo</option>
                {props.tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field nome="responsavel" rotulo="Responsável">
            <Select id="responsavel" name="responsavel" defaultValue="">
              <option value="">Você</option>
              {props.membros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </Select>
          </Field>

          <Field nome="notas" rotulo="Notas" erro={e.notas} className="sm:col-span-2">
            <Textarea
              id="notas"
              name="notas"
              maxLength={5000}
              aria-invalid={e.notas !== undefined}
              aria-describedby={describedBy('notas', e.notas)}
            />
          </Field>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Submit>Agendar</Submit>
        <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
        {estado.salvo !== null && <FormSuccess>{`${estado.salvo} entrou na agenda.`}</FormSuccess>}
      </div>
    </form>
  );
}
