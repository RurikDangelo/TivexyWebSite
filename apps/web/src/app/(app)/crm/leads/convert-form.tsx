'use client';

import type { CrmLeadStatus } from '@tivexy/core';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useState } from 'react';

import { describedBy, Field, idDoCampo, useEscopo } from '@/components/form/field';
import { FormError, FormSuccess } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';

import { converterLead } from './actions';
import { CONVERSAO_INICIAL, type EtapaOferecida } from './state';

/**
 * Converter: o lead vira conta, pessoa e oportunidade.
 *
 * **Só a etapa é obrigatória.** Título e valor entram depois, na tela da
 * oportunidade; exigi-los aqui faria a pessoa inventar um número para
 * conseguir seguir, e número inventado num funil é pior do que campo vazio.
 *
 * ## Por que virou diálogo
 *
 * Abria no lugar, embaixo da linha, "para não tirar a lista da vista". Numa
 * lista de cartões isso funcionava; numa tabela de 50 linhas, um formulário de
 * três campos dentro de uma célula empurra todas as linhas abaixo dele — o
 * mesmo defeito que a auditoria aponta no "Mover para…" do quadro. O diálogo
 * mantém a lista atrás, dá largura aos três campos e devolve o foco à linha ao
 * fechar.
 */
export interface ConvertFormProps {
  leadId: string;
  leadNome: string;
  status: CrmLeadStatus;
  etapas: readonly EtapaOferecida[];
}

export function ConvertForm({ leadId, leadNome, status, etapas }: ConvertFormProps) {
  const [estado, acao] = useActionState(converterLead, CONVERSAO_INICIAL);
  const [aberto, setAberto] = useState(false);
  /*
   * Montado uma vez, nunca desmontado: sem isto o diálogo sumiria do DOM no
   * mesmo quadro em que fecha, e a animação de saída não teria onde correr.
   * Antes de abrir ele não existe — 50 diálogos ociosos significariam 50 cópias
   * da lista de etapas no HTML da página.
   */
  const [jaAbriu, setJaAbriu] = useState(false);
  /* Dois formulários de conversão na mesma tela colidiriam em `id="etapa"`. */
  const escopo = useEscopo();

  const virou = estado.convertido !== null;

  /*
   * Converter é oferecido em qualquer estado vivo, não só no qualificado.
   * Quem liga dizendo que quer fechar não deveria precisar passar por dois
   * cliques de etiqueta antes — e a função no banco recusa o que não pode.
   *
   * Sem etapa não há para onde a oportunidade ir. Nesse caso a linha não
   * oferece nada: quem avisa é a faixa única no topo da lista, uma vez, em vez
   * de cinquenta linhas repetindo "sem funil".
   */
  const oferecer = etapas.length > 0 && status !== 'converted' && status !== 'disqualified';

  /* Depois de converter o lead fica `converted`, e é este ramo que segura a
     confirmação na tela até a pessoa fechar. */
  if (!oferecer && !virou) return null;

  function abrir() {
    setJaAbriu(true);
    setAberto(true);
  }

  return (
    <>
      {oferecer && (
        <Button type="button" size="xs" variant="outline" onClick={abrir}>
          <ArrowRight aria-hidden />
          Converter
        </Button>
      )}

      {jaAbriu && (
        <Dialog
          aberto={aberto}
          aoFechar={() => setAberto(false)}
          titulo={`Converter ${leadNome}`}
          descricao="Cria a conta, a pessoa e a oportunidade numa transação só. Pela tela não dá para desfazer."
        >
          {virou ? (
            <div className="flex flex-col gap-4">
              <FormSuccess>
                {estado.convertido} virou cliente: conta, pessoa e oportunidade criadas.
              </FormSuccess>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/crm/oportunidades"
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  Ver no funil
                </Link>
                <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          ) : (
            <form action={acao} className="flex flex-col gap-3">
              <input type="hidden" name="id" value={leadId} />
              <input type="hidden" name="nome" value={leadNome} />

              {estado.erro !== null && <FormError>{estado.erro}</FormError>}

              <Field nome="etapa" rotulo="Entra em" obrigatorio escopo={escopo}>
                <Select id={idDoCampo('etapa', escopo)} name="etapa" required>
                  {etapas.map((etapa) => (
                    <option key={etapa.id} value={etapa.id}>
                      {etapa.funil} · {etapa.nome}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                nome="titulo"
                rotulo="Oportunidade"
                dica="Em branco, a oportunidade nasce com o nome do lead."
                escopo={escopo}
              >
                <Input
                  id={idDoCampo('titulo', escopo)}
                  name="titulo"
                  placeholder={leadNome}
                  aria-describedby={describedBy('titulo', undefined, 'dica', escopo)}
                />
              </Field>

              <Field
                nome="valor"
                rotulo="Valor"
                dica="Em branco entra como zero. O funil aceita — o valor chega depois."
                escopo={escopo}
              >
                <Input
                  id={idDoCampo('valor', escopo)}
                  name="valor"
                  inputMode="decimal"
                  placeholder="1.234,56"
                  aria-describedby={describedBy('valor', undefined, 'dica', escopo)}
                />
              </Field>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Submit pendente="Convertendo…">
                  <ArrowRight aria-hidden />
                  Converter
                </Submit>
                <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          )}
        </Dialog>
      )}
    </>
  );
}
