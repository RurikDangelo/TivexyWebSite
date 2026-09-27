'use client';

import { type CrmLeadStatus, nextLeadStatuses } from '@tivexy/core';
import { CircleCheckBig, CircleSlash, type LucideIcon, PhoneCall, RotateCcw } from 'lucide-react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { FormError } from '@/components/form/messages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TD, TR } from '@/components/ui/table';
import { atrasoDaLinha } from '@/lib/utils';

import { moverLead } from './actions';
import { ConvertForm } from './convert-form';
import { type EtapaOferecida, LEAD_STATUS_LABEL, LEAD_STATUS_TONE, MOVER_INICIAL } from './state';

export interface LeadListado {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  source: string | null;
  status: CrmLeadStatus;
  /** Já formatado no fuso da empresa pelo servidor — a linha não decide fuso. */
  criadoEm: string;
  /** O instante cru, para o `<time datetime>`. */
  criadoEmISO: string;
}

/**
 * O botão diz a **ação**, não o estado de destino.
 *
 * "Qualificado" num botão é ambíguo — parece rótulo do que a pessoa é agora.
 * "Qualificar" diz o que o clique faz. O ícone acompanha porque a coluna de
 * ações é a mais varrida da tabela, e uma fileira de três rótulos parecidos se
 * lê mais rápido pelo símbolo.
 */
const ACAO: Record<CrmLeadStatus, { rotulo: string; Icone: LucideIcon }> = {
  new: { rotulo: 'Reabrir', Icone: RotateCcw },
  contacted: { rotulo: 'Marcar contato', Icone: PhoneCall },
  qualified: { rotulo: 'Qualificar', Icone: CircleCheckBig },
  disqualified: { rotulo: 'Descartar', Icone: CircleSlash },
  /* Não chega aqui: converter não é transição. Ver `nextLeadStatuses`. */
  converted: { rotulo: 'Converter', Icone: CircleCheckBig },
};

/**
 * Os botões de transição, dentro de um `<form>` só.
 *
 * Um formulário por linha, e não um por botão, para que exista **um** estado de
 * erro por linha e um só `useActionState`. Cada botão carrega o destino em
 * `name="para"`, que é o comportamento nativo de vários `submit` no mesmo
 * formulário.
 *
 * `useFormStatus().data` diz qual botão disparou — sem ele, `pending` acenderia
 * o spinner nos três ao mesmo tempo e a pessoa não saberia o que está em voo.
 */
function Transicoes({ destinos }: { destinos: readonly CrmLeadStatus[] }) {
  const { pending, data } = useFormStatus();
  const emVoo = pending ? String(data?.get('para') ?? '') : null;

  return (
    <>
      {destinos.map((destino) => {
        const { rotulo, Icone } = ACAO[destino];
        const esteEmVoo = emVoo === destino;
        return (
          <Button
            key={destino}
            type="submit"
            name="para"
            value={destino}
            size="xs"
            variant="outline"
            carregando={esteEmVoo}
            /* Os outros também travam: duas transições em voo na mesma linha
               deixariam a segunda recusada pelo `.eq('status', de)` e o erro
               pareceria defeito. */
            disabled={pending}
          >
            {/* O `carregando` do Button já põe o spinner no lugar do ícone. */}
            {esteEmVoo ? null : <Icone aria-hidden />}
            {rotulo}
          </Button>
        );
      })}
    </>
  );
}

export interface LeadRowProps {
  lead: LeadListado;
  etapas: readonly EtapaOferecida[];
  /** Sem `crm.leads.write` a linha é só leitura — nem transição, nem converter. */
  podeEditar: boolean;
  /** Quantas colunas o `<thead>` tem, para a linha de erro atravessar a tabela. */
  colunas: number;
  indice: number;
  /** Escalonar a entrada só na primeira pintura da rota, nunca ao filtrar ou paginar. */
  escalonar: boolean;
}

/**
 * Uma linha da tabela, com as transições possíveis na última coluna.
 *
 * Os botões saem de `nextLeadStatuses()` — a mesma função que o servidor
 * consulta antes de gravar. Não é validação duplicada: é uma regra só, lida
 * dos dois lados. Uma lista escrita à mão aqui divergiria no primeiro estado
 * novo, e a divergência apareceria como botão que não faz nada.
 *
 * Cada transição é um `form` com Server Action, não um link: mudar estado por
 * GET seria disparado por pré-carregamento do navegador.
 *
 * Componente de cliente porque a linha tem dois estados de ação independentes
 * (mover e converter) e precisa mostrar o erro de cada um onde ele aconteceu.
 * Ela é folha: nada de servidor pende abaixo dela.
 */
export function LeadRow({ lead, etapas, podeEditar, colunas, indice, escalonar }: LeadRowProps) {
  const [estado, acao] = useActionState(moverLead, MOVER_INICIAL);
  const destinos = nextLeadStatuses(lead.status);

  /*
   * Movimento: entrada escalonada OU realce de confirmação, nunca os dois — as
   * duas classes escrevem a mesma propriedade `animation` e a ordem de quem
   * ganha seria a ordem da folha, que ninguém controla daqui. Depois de mover,
   * o que importa é o pulso onde a linha está (seção 8, regra 4).
   */
  const movimento =
    estado.movido !== null ? 'animate-highlight' : escalonar ? 'animate-enter' : undefined;

  return (
    <>
      <TR
        className={movimento}
        style={
          movimento === 'animate-enter' ? { animationDelay: atrasoDaLinha(indice) } : undefined
        }
      >
        <TD rotulo="Nome" truncar className="font-medium text-content">
          {lead.name}
        </TD>

        <TD rotulo="Estado">
          <Badge tone={LEAD_STATUS_TONE[lead.status]}>{LEAD_STATUS_LABEL[lead.status]}</Badge>
        </TD>

        {/*
         * Colunas extras entram por breakpoint (seção 3). Abaixo de `md` o
         * `<Table mobile="blocos">` transforma toda célula em bloco rotulado e
         * vence este `hidden` — de propósito: no bloco há altura de sobra, e
         * esconder e-mail e origem justamente no celular deixaria a lista sem
         * o dado que faz alguém ligar de volta.
         */}
        <TD rotulo="Empresa" truncar className="hidden text-content-muted xl:table-cell">
          {lead.companyName ?? <Ausente />}
        </TD>

        <TD rotulo="E-mail" truncar className="hidden lg:table-cell">
          {lead.email === null ? (
            <Ausente />
          ) : (
            <a href={`mailto:${lead.email}`} className="text-content-accent hover:underline">
              {lead.email}
            </a>
          )}
        </TD>

        <TD rotulo="Telefone" truncar className="hidden xl:table-cell">
          {lead.phone === null ? (
            <Ausente />
          ) : (
            <a href={`tel:${lead.phone}`} className="text-content-accent hover:underline">
              {lead.phone}
            </a>
          )}
        </TD>

        <TD rotulo="Origem" truncar className="hidden text-content-muted xl:table-cell">
          {lead.source ?? <Ausente />}
        </TD>

        <TD rotulo="Entrou" numerico alinhamento="inicio" className="text-content-muted">
          <time dateTime={lead.criadoEmISO}>{lead.criadoEm}</time>
        </TD>

        <TD acoes>
          <div className="flex flex-wrap items-center justify-end gap-1.5 max-md:justify-start">
            {podeEditar && destinos.length > 0 && (
              <form action={acao} className="flex flex-wrap items-center gap-1.5">
                <input type="hidden" name="id" value={lead.id} />
                <input type="hidden" name="de" value={lead.status} />
                <Transicoes destinos={destinos} />
              </form>
            )}
            {/*
             * Sempre montado quando há permissão de escrita — mesmo depois de
             * converter, quando o próprio componente devolve `null`. Trocar o
             * elemento por `false` nesta posição o desmontaria, e com ele a
             * confirmação de sucesso que o `useActionState` dele guarda.
             */}
            {podeEditar && (
              <ConvertForm
                leadId={lead.id}
                leadNome={lead.name}
                status={lead.status}
                etapas={etapas}
              />
            )}
          </div>
        </TD>
      </TR>

      {estado.erro !== null && (
        /*
         * O erro da transição na linha dele, e não numa faixa no topo: com 50
         * linhas na tela, um aviso longe da ação não diz qual lead falhou.
         */
        <TR>
          <TD colSpan={colunas}>
            <FormError>{estado.erro}</FormError>
          </TD>
        </TR>
      )}
    </>
  );
}

/**
 * Célula sem valor. Um traço, nunca um valor de exemplo.
 *
 * O traço é decorativo e a palavra é para quem ouve: "E-mail —" não diz nada,
 * e no modo blocos do celular é assim que a célula é lida.
 */
function Ausente() {
  return (
    <span className="text-content-subtle">
      <span aria-hidden>—</span>
      <span className="sr-only">não informado</span>
    </span>
  );
}
