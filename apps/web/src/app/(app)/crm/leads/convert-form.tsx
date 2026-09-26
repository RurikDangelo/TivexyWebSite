'use client';

import { ArrowRight, Loader2 } from 'lucide-react';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Input, Label } from '@/components/ui/input';

import { converterLead } from './actions';
import { CONVERSAO_INICIAL, type EtapaOferecida } from './state';

/**
 * Converter: o lead vira conta, pessoa e oportunidade.
 *
 * Abre no lugar, embaixo da linha. Um diálogo daria mais espaço e tiraria da
 * vista a lista inteira — e quem converte normalmente está olhando para os
 * outros leads da fila enquanto decide.
 *
 * **Só a etapa é obrigatória.** Título e valor entram depois, na tela da
 * oportunidade; exigi-los aqui faria a pessoa inventar um número para
 * conseguir seguir, e número inventado num funil é pior do que campo vazio.
 */
function Enviar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-surface-brand px-3 text-xs font-medium text-content-on-brand transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Convertendo…
        </>
      ) : (
        <>
          <ArrowRight className="size-3.5" aria-hidden />
          Converter
        </>
      )}
    </button>
  );
}

export function ConvertForm({
  leadId,
  leadNome,
  etapas,
}: {
  leadId: string;
  leadNome: string;
  etapas: readonly EtapaOferecida[];
}) {
  const [estado, acao] = useActionState(converterLead, CONVERSAO_INICIAL);
  const [aberto, setAberto] = useState(false);

  /*
   * Sem etapa não há para onde a oportunidade ir. Acontece quando o nicho não
   * semeou funil — dizer isso é melhor do que um botão que abre um formulário
   * com a lista vazia.
   */
  if (etapas.length === 0) {
    return (
      <span className="text-xs text-content-subtle" title="Crie um funil antes de converter">
        Sem funil
      </span>
    );
  }

  if (estado.convertido !== null) {
    return (
      <span role="status" className="text-xs text-success">
        Virou cliente.
      </span>
    );
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="h-8 rounded-md border border-line-strong px-3 text-xs font-medium text-content-accent transition-colors hover:bg-surface-accent-soft"
      >
        Converter
      </button>
    );
  }

  return (
    <form action={acao} className="w-full rounded-md border border-line-subtle bg-surface p-3">
      <input type="hidden" name="id" value={leadId} />
      <input type="hidden" name="nome" value={leadNome} />

      {estado.erro !== null && (
        <p role="alert" className="mb-3 rounded bg-danger/10 px-2 py-1.5 text-xs text-danger">
          {estado.erro}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`etapa-${leadId}`} className="text-xs">
            Entra em
          </Label>
          <select
            id={`etapa-${leadId}`}
            name="etapa"
            required
            className="h-8 w-full rounded-md border border-line-field bg-surface px-2 text-xs text-content"
          >
            {etapas.map((etapa) => (
              <option key={etapa.id} value={etapa.id}>
                {etapa.funil} · {etapa.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor={`titulo-${leadId}`} className="text-xs">
            Oportunidade <span className="text-content-subtle">(opcional)</span>
          </Label>
          <Input
            id={`titulo-${leadId}`}
            name="titulo"
            className="h-8 text-xs"
            placeholder={leadNome}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor={`valor-${leadId}`} className="text-xs">
            Valor <span className="text-content-subtle">(opcional)</span>
          </Label>
          <Input
            id={`valor-${leadId}`}
            name="valor"
            inputMode="decimal"
            className="h-8 text-xs"
            placeholder="1.234,56"
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Enviar />
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="h-8 px-2 text-xs text-content-muted transition-colors hover:text-content"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
