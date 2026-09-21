'use client';

import { type CrmLeadStatus, nextLeadStatuses } from '@tivexy/core';

import { Badge } from '@/components/ui/badge';

import { moverLead } from './actions';
import { LEAD_STATUS_LABEL, LEAD_STATUS_TONE } from './state';

export interface LeadListado {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  source: string | null;
  status: CrmLeadStatus;
  createdAt: string;
}

/**
 * Uma linha da lista, com as transições possíveis à direita.
 *
 * Os botões saem de `nextLeadStatuses()` — a mesma função que o servidor
 * consulta antes de gravar. Não é validação duplicada: é uma regra só, lida
 * dos dois lados. Uma lista escrita à mão aqui divergiria no primeiro estado
 * novo, e a divergência apareceria como botão que não faz nada.
 *
 * Cada transição é um `form` com Server Action, não um link: mudar estado por
 * GET seria disparado por pré-carregamento do navegador.
 */
export function LeadRow({ lead }: { lead: LeadListado }) {
  const destinos = nextLeadStatuses(lead.status);

  return (
    <li className="flex flex-col gap-3 border-b border-line-subtle p-4 last:border-b-0 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-content">{lead.name}</span>
          <Badge tone={LEAD_STATUS_TONE[lead.status]}>{LEAD_STATUS_LABEL[lead.status]}</Badge>
        </div>

        <p className="mt-0.5 truncate text-sm text-content-muted">
          {[lead.companyName, lead.email, lead.phone].filter(Boolean).join(' · ') || 'Sem contato'}
        </p>

        {lead.source !== null && (
          <p className="mt-0.5 text-xs text-content-subtle">Veio de {lead.source}</p>
        )}
      </div>

      {destinos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {destinos.map((destino) => (
            <form key={destino} action={moverLead}>
              <input type="hidden" name="id" value={lead.id} />
              <input type="hidden" name="de" value={lead.status} />
              <input type="hidden" name="para" value={destino} />
              <button
                type="submit"
                className="h-8 rounded-md border border-line-strong px-3 text-xs text-content-default transition-colors hover:bg-surface-muted"
              >
                {rotuloDaAcao(destino)}
              </button>
            </form>
          ))}
        </div>
      )}
    </li>
  );
}

/**
 * O botão diz a **ação**, não o estado de destino.
 *
 * "Qualificado" num botão é ambíguo — parece rótulo do que a pessoa é agora.
 * "Qualificar" diz o que o clique faz.
 */
function rotuloDaAcao(destino: CrmLeadStatus): string {
  switch (destino) {
    case 'new':
      return 'Reabrir';
    case 'contacted':
      return 'Marcar contato';
    case 'qualified':
      return 'Qualificar';
    case 'disqualified':
      return 'Descartar';
    case 'converted':
      /* Não chega aqui: converter não é transição. Ver `nextLeadStatuses`. */
      return 'Converter';
  }
}
