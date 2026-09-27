'use client';

import {
  AUTOMATION_TRIGGERS,
  type AutomationAction,
  type AutomationTrigger,
  OPERADORES_POR_TIPO,
  actionAllowedFor,
  renderAutomationTemplate,
} from '@tivexy/core';
import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';

import { Field, describedBy } from '@/components/form/field';
import { FormError } from '@/components/form/messages';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { SectionLabel } from '@/components/ui/section-label';
import { EXEMPLO_DO_EVENTO, nomeDoGatilho } from '@/lib/automation/rule-text';

import { CamposDaAcao } from './rule-action';
import { CondicaoLinha } from './rule-condition';
import {
  MAXIMO_DE_CONDICOES,
  type OpcoesDoEditor,
  type Rascunho,
  campos,
  resumo,
  serializar,
  valorInicial,
} from './rule-draft';
import { PreviaDaMensagem, VariaveisDoEvento } from './rule-preview';

/*
 * O editor ficou só com a orquestração: o estado do rascunho, as três
 * transições que dependem umas das outras (trocar gatilho, trocar campo,
 * inserir variável) e a moldura das três seções. Cada peça de formulário mora
 * num arquivo irmão — `rule-condition`, `rule-action`, `rule-preview` — e as
 * funções puras em `rule-draft`.
 */

export interface RuleEditorProps {
  prefixo: string;
  inicial: Rascunho;
  opcoes: OpcoesDoEditor;
  problemas: Readonly<Record<string, string>>;
}

/**
 * Montar uma automação: quando, se, então.
 *
 * Controlado de ponta a ponta, porque as partes dependem umas das outras: o
 * gatilho decide os campos das condições, o tipo do campo decide as
 * comparações, e a ação decide o que se pergunta embaixo. O que sai daqui é um
 * campo escondido com a regra inteira.
 */
export function RuleEditor({ prefixo, inicial, opcoes, problemas }: RuleEditorProps) {
  const [r, setR] = useState(inicial);
  const proximaChave = useRef(inicial.condicoes.length);
  const tituloRef = useRef<HTMLInputElement>(null);
  const textoRef = useRef<HTMLTextAreaElement>(null);
  const alvo = useRef<'titulo' | 'texto'>('titulo');

  const id = (campo: string) => `${prefixo}-${campo}`;
  const definicao = AUTOMATION_TRIGGERS[r.gatilho];
  const mudar = (parcial: Partial<Rascunho>) => setR((atual) => ({ ...atual, ...parcial }));

  function trocarGatilho(gatilho: AutomationTrigger) {
    const nova = AUTOMATION_TRIGGERS[gatilho];
    setR((atual) => ({
      ...atual,
      gatilho,
      // Os campos são outros: condição de venda não vale para lead.
      condicoes: [],
      acao: actionAllowedFor(atual.acao, gatilho) ? atual.acao : 'core.notify',
      destino:
        atual.destino === 'responsavel' && !nova.temResponsavel ? 'permissao' : atual.destino,
    }));
  }

  function mudarCondicao(chave: number, parcial: Partial<Rascunho['condicoes'][number]>) {
    setR((atual) => ({
      ...atual,
      condicoes: atual.condicoes.map((c) => {
        if (c.chave !== chave) return c;
        const nova = { ...c, ...parcial };
        if (parcial.campo !== undefined && parcial.campo !== c.campo) {
          // Outro campo, outro tipo: a comparação e o valor recomeçam.
          const campo = campos(atual.gatilho).find((d) => d.campo === parcial.campo);
          nova.operador = campo === undefined ? 'eq' : (OPERADORES_POR_TIPO[campo.tipo][0] ?? 'eq');
          nova.valor = valorInicial(campo);
        }
        return nova;
      }),
    }));
  }

  function adicionarCondicao() {
    const campo = definicao.campos[0];
    if (campo === undefined) return;
    proximaChave.current += 1;
    const chave = proximaChave.current;
    setR((atual) => ({
      ...atual,
      condicoes: [
        ...atual.condicoes,
        {
          chave,
          campo: campo.campo,
          operador: OPERADORES_POR_TIPO[campo.tipo][0] ?? 'eq',
          valor: valorInicial(campo),
        },
      ],
    }));
  }

  function removerCondicao(chave: number) {
    setR((atual) => ({
      ...atual,
      condicoes: atual.condicoes.filter((x) => x.chave !== chave),
    }));
  }

  /** Põe `{{variavel}}` onde está o cursor — no título ou no texto, o último que teve foco. */
  function inserirVariavel(variavel: string) {
    const qual = r.acao === 'core.notify' ? alvo.current : 'titulo';
    const el = qual === 'texto' ? textoRef.current : tituloRef.current;
    const atual = r[qual];
    const inicio = el?.selectionStart ?? atual.length;
    const fim = el?.selectionEnd ?? atual.length;
    const trecho = `{{${variavel}}}`;
    const novo = atual.slice(0, inicio) + trecho + atual.slice(fim);
    mudar(qual === 'texto' ? { texto: novo } : { titulo: novo });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(inicio + trecho.length, inicio + trecho.length);
    });
  }

  const exemplo = EXEMPLO_DO_EVENTO[r.gatilho];
  const acoes: { valor: AutomationAction; rotulo: string }[] = [
    { valor: 'core.notify', rotulo: 'Avisar alguém aqui dentro' },
  ];
  if (opcoes.podeCriarAtividade && actionAllowedFor('crm.activity.create', r.gatilho)) {
    acoes.push({ valor: 'crm.activity.create', rotulo: 'Criar atividade no CRM' });
  }

  return (
    <div className="flex flex-col gap-5">
      <input type="hidden" name="regra" value={serializar(r)} />

      <Field nome={id('nome')} rotulo="Nome" obrigatorio erro={problemas.nome}>
        <Input
          id={id('nome')}
          value={r.nome}
          onChange={(e) => mudar({ nome: e.target.value })}
          maxLength={120}
          placeholder="Aviso de venda grande"
          aria-invalid={problemas.nome !== undefined}
          aria-describedby={describedBy(id('nome'), problemas.nome)}
        />
      </Field>

      {/* ── Quando ─────────────────────────────────────────────────── */}
      <fieldset className="flex flex-col gap-2">
        <SectionLabel como="legend" className="mb-1.5">
          Quando
        </SectionLabel>
        <Field
          nome={id('gatilho')}
          rotulo="Evento que dispara"
          rotuloOculto
          obrigatorio
          erro={problemas.gatilho}
        >
          <Select
            id={id('gatilho')}
            value={r.gatilho}
            onChange={(e) => trocarGatilho(e.target.value as AutomationTrigger)}
            aria-invalid={problemas.gatilho !== undefined}
            aria-describedby={describedBy(id('gatilho'), problemas.gatilho)}
          >
            {opcoes.gatilhos.map((g) => (
              <option key={g} value={g}>
                {nomeDoGatilho(g, opcoes.terms)}
              </option>
            ))}
          </Select>
        </Field>
      </fieldset>

      {/* ── Se ─────────────────────────────────────────────────────── */}
      <fieldset className="flex flex-col gap-2">
        <SectionLabel como="legend" className="mb-1.5">
          Se
        </SectionLabel>
        {r.condicoes.length === 0 && (
          <p className="text-body text-content-muted">Sem condição: vale para todo evento.</p>
        )}
        <ol className="flex flex-col gap-2">
          {r.condicoes.map((c, i) => (
            <CondicaoLinha
              key={c.chave}
              condicao={c}
              opcoesDeCampo={definicao.campos}
              indice={i}
              prefixo={prefixo}
              erro={problemas[`condicoes.${i}`]}
              aoMudar={(parcial) => mudarCondicao(c.chave, parcial)}
              aoRemover={() => removerCondicao(c.chave)}
            />
          ))}
        </ol>
        {problemas.condicoes !== undefined && <FormError>{problemas.condicoes}</FormError>}
        {r.condicoes.length < MAXIMO_DE_CONDICOES && (
          <div>
            <Button type="button" variant="outline" size="sm" onClick={adicionarCondicao}>
              <Plus aria-hidden />
              Condição
            </Button>
          </div>
        )}
        {r.condicoes.length > 1 && (
          <p className="text-caption text-content-subtle">Todas precisam valer ao mesmo tempo.</p>
        )}
      </fieldset>

      {/* ── Então ──────────────────────────────────────────────────── */}
      <fieldset className="flex flex-col gap-3">
        <SectionLabel como="legend" className="mb-1.5">
          Então
        </SectionLabel>
        <Field nome={id('acao')} rotulo="O que fazer" obrigatorio erro={problemas.acao}>
          <Select
            id={id('acao')}
            value={r.acao}
            onChange={(e) => mudar({ acao: e.target.value as AutomationAction })}
            aria-invalid={problemas.acao !== undefined}
            aria-describedby={describedBy(id('acao'), problemas.acao)}
          >
            {acoes.map((a) => (
              <option key={a.valor} value={a.valor}>
                {a.rotulo}
              </option>
            ))}
          </Select>
        </Field>

        <CamposDaAcao
          rascunho={r}
          prefixo={prefixo}
          opcoes={opcoes}
          problemas={problemas}
          temResponsavel={definicao.temResponsavel}
          aoMudar={mudar}
        />

        <Field
          nome={id('titulo')}
          rotulo={r.acao === 'core.notify' ? 'Título do aviso' : 'Assunto da atividade'}
          obrigatorio
          erro={problemas.titulo}
        >
          <Input
            ref={tituloRef}
            id={id('titulo')}
            value={r.titulo}
            onChange={(e) => mudar({ titulo: e.target.value })}
            onFocus={() => {
              alvo.current = 'titulo';
            }}
            maxLength={200}
            aria-invalid={problemas.titulo !== undefined}
            aria-describedby={describedBy(id('titulo'), problemas.titulo)}
          />
        </Field>

        {r.acao === 'core.notify' && (
          <Field nome={id('texto')} rotulo="Texto" erro={problemas.texto}>
            <Textarea
              ref={textoRef}
              id={id('texto')}
              value={r.texto}
              onChange={(e) => mudar({ texto: e.target.value })}
              onFocus={() => {
                alvo.current = 'texto';
              }}
              rows={2}
              maxLength={1000}
              aria-invalid={problemas.texto !== undefined}
              aria-describedby={describedBy(id('texto'), problemas.texto)}
            />
          </Field>
        )}

        <VariaveisDoEvento variaveis={definicao.variaveis} aoInserir={inserirVariavel} />
        <PreviaDaMensagem
          titulo={renderAutomationTemplate(r.titulo, exemplo).trim()}
          texto={renderAutomationTemplate(r.texto, exemplo).trim()}
          mostrarTexto={r.acao === 'core.notify'}
        />
      </fieldset>

      <p className="rounded-control bg-surface-accent-soft px-3 py-2 text-body text-content-default">
        {resumo(r, opcoes)}
      </p>
      {problemas.regra !== undefined && <FormError>{problemas.regra}</FormError>}
    </div>
  );
}
