'use client';

import { useActionState, useRef } from 'react';

import { PainelDeCadastro } from '@/components/crm/create-panel';
import { Campo, CampoTexto } from '@/components/ui/field';
import { Label, Select } from '@/components/ui/input';

import { criarAtividade } from './actions';
import { ATIVIDADE_INICIAL, type AlvoOferecido, ALVOS, GRUPO_DO_ALVO } from './state';

/**
 * Registrar uma atividade.
 *
 * **O alvo é um campo só.** O esquema exige exatamente um alvo
 * (`crm_activities_one_target`), e quatro campos na tela poderiam discordar
 * entre si — a pessoa descobriria no erro de constraint. Um `select` com
 * grupos resolve pela forma: não há como escolher dois, nem nenhum.
 */
export function ActivityForm({
  alvos,
  tipos,
}: {
  alvos: readonly AlvoOferecido[];
  tipos: readonly { id: string; nome: string }[];
}) {
  const [estado, acao] = useActionState(criarAtividade, ATIVIDADE_INICIAL);
  const primeiro = useRef<HTMLInputElement>(null);

  return (
    <PainelDeCadastro
      titulo="Nova atividade"
      acao={acao}
      estado={estado}
      confirmacao={(assunto) => `"${assunto}" entrou na agenda.`}
      rotuloEnviar="Registrar"
      aoSalvar={() => primeiro.current?.focus()}
    >
      <Campo
        nome="subject"
        rotulo="Assunto"
        obrigatorio
        referencia={primeiro}
        erro={estado.campos.subject}
        placeholder="Ligar para confirmar o orçamento"
      />

      <SeletorDeAlvo alvos={alvos} erro={estado.campos.alvo} />

      {tipos.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="type_id">
            Tipo
            <span className="ml-1 text-xs text-content-subtle">(opcional)</span>
          </Label>
          <Select id="type_id" name="type_id" defaultValue="">
            <option value="">Sem tipo</option>
            {tipos.map((tipo) => (
              <option key={tipo.id} value={tipo.id}>
                {tipo.nome}
              </option>
            ))}
          </Select>
          <p className="text-xs text-content-subtle">Vem do nicho da empresa.</p>
        </div>
      )}

      <Campo
        nome="due_at"
        rotulo="Prazo"
        tipo="datetime-local"
        erro={estado.campos.due_at}
        dica="No fuso da empresa. Em branco, fica sem prazo."
      />

      <CampoTexto
        nome="notes"
        rotulo="Observações"
        className="sm:col-span-2"
        placeholder="O que precisa ser dito nessa conversa."
      />
    </PainelDeCadastro>
  );
}

/**
 * Sobre quem é a atividade.
 *
 * Os quatro tipos viram `<optgroup>`, e o valor de cada opção carrega o tipo
 * junto (`lead:<uuid>`). É o que permite ao servidor saber em qual das quatro
 * colunas gravar sem que a tela precise de um segundo campo escondido — e
 * campo escondido é exatamente o que diverge do visível.
 */
function SeletorDeAlvo({ alvos, erro }: { alvos: readonly AlvoOferecido[]; erro?: string }) {
  const idErro = erro !== undefined ? 'alvo-erro' : undefined;

  if (alvos.length === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="alvo">Sobre</Label>
        <p className="rounded-md border border-dashed border-line-subtle px-3 py-2 text-sm text-content-muted">
          Cadastre um lead, contato, empresa ou oportunidade antes — toda atividade fala de alguma
          coisa.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="alvo">Sobre</Label>
      <Select
        id="alvo"
        name="alvo"
        required
        defaultValue=""
        aria-invalid={erro !== undefined}
        aria-describedby={idErro}
      >
        <option value="" disabled>
          Escolha quem…
        </option>
        {ALVOS.map((tipo) => {
          const doTipo = alvos.filter((alvo) => alvo.tipo === tipo);
          if (doTipo.length === 0) return null;
          return (
            <optgroup key={tipo} label={GRUPO_DO_ALVO[tipo]}>
              {doTipo.map((alvo) => (
                <option key={alvo.valor} value={alvo.valor}>
                  {alvo.nome}
                </option>
              ))}
            </optgroup>
          );
        })}
      </Select>
      {erro !== undefined && (
        <p id={idErro} role="alert" className="text-xs text-danger">
          {erro}
        </p>
      )}
    </div>
  );
}
