import {
  AUTOMATION_TRIGGERS,
  type AutomationAction,
  type AutomationCondition,
  type AutomationTrigger,
  type CampoDoGatilho,
  type ConditionOperator,
  formatCentsInput,
  parseCents,
} from '@tivexy/core';

import {
  type Pessoa,
  descreverAcao,
  descreverCondicao,
  nomeDoGatilho,
} from '@/lib/automation/rule-text';
import type { Terms } from '@/lib/terms/vocabulary';

/*
 * O rascunho da automação e as funções puras em volta dele.
 *
 * Módulo sem JSX e sem `'use client'`: o `page.tsx` (Server Component) importa
 * `OpcoesDoEditor` daqui, e o editor — que é cliente — importa o resto. Deixar
 * os tipos no mesmo arquivo do formulário obrigava o servidor a puxar a
 * fronteira de cliente só para nomear uma prop.
 */

export interface CondicaoRascunho {
  chave: number;
  campo: string;
  operador: ConditionOperator;
  valor: string;
}

/** O que está sendo editado — texto, do jeito que a pessoa digita. */
export interface Rascunho {
  nome: string;
  gatilho: AutomationTrigger;
  condicoes: CondicaoRascunho[];
  acao: AutomationAction;
  destino: 'responsavel' | 'usuario' | 'permissao';
  usuario: string;
  permissao: string;
  titulo: string;
  texto: string;
  dias: string;
  responsavel: string;
}

/** O que a empresa oferece a esta pessoa: gatilhos dos módulos que tem, gente, permissões. */
export interface OpcoesDoEditor {
  gatilhos: readonly AutomationTrigger[];
  podeCriarAtividade: boolean;
  pessoas: readonly Pessoa[];
  permissoes: readonly { codigo: string; rotulo: string }[];
  terms: Terms;
}

export const DICA_DO_PRAZO = 'Zero vence no mesmo dia, às 23h59.';

/** Teto de condições por regra. Acima disso a frase deixa de ser legível. */
export const MAXIMO_DE_CONDICOES = 10;

export function campos(gatilho: AutomationTrigger): readonly CampoDoGatilho[] {
  return AUTOMATION_TRIGGERS[gatilho].campos;
}

export function valorInicial(campo: CampoDoGatilho | undefined): string {
  return campo?.tipo === 'opcao' ? (campo.opcoes?.[0]?.valor ?? '') : '';
}

/** Uma regra salva (ou um modelo) de volta para o que a pessoa editaria. */
export function rascunhoDe(regra: {
  nome: string;
  gatilho: AutomationTrigger;
  condicoes: readonly AutomationCondition[];
  acao: AutomationAction;
  params: Readonly<Record<string, string | number>>;
}): Rascunho {
  const p = regra.params;
  const texto = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    nome: regra.nome,
    gatilho: regra.gatilho,
    condicoes: regra.condicoes.map((c, i) => {
      const campo = campos(regra.gatilho).find((d) => d.campo === c.campo);
      return {
        chave: i,
        campo: c.campo,
        operador: c.operador,
        valor:
          campo?.tipo === 'dinheiro' && typeof c.valor === 'number'
            ? formatCentsInput(c.valor)
            : String(c.valor),
      };
    }),
    acao: regra.acao,
    destino:
      p.destino === 'usuario' || p.destino === 'responsavel' || p.destino === 'permissao'
        ? p.destino
        : 'permissao',
    usuario: texto(p.usuario),
    permissao: texto(p.permissao),
    titulo: texto(p.titulo),
    texto: texto(p.texto),
    dias: typeof p.dias === 'number' ? String(p.dias) : '1',
    responsavel: texto(p.responsavel) || 'responsavel',
  };
}

export function rascunhoVazio(gatilho: AutomationTrigger): Rascunho {
  return {
    nome: '',
    gatilho,
    condicoes: [],
    acao: 'core.notify',
    destino: AUTOMATION_TRIGGERS[gatilho].temResponsavel ? 'responsavel' : 'permissao',
    usuario: '',
    permissao: '',
    titulo: '',
    texto: '',
    dias: '1',
    responsavel: 'responsavel',
  };
}

/** O JSON que a ação do servidor lê — ver `parseRuleForm`. */
export function serializar(r: Rascunho): string {
  const params: Record<string, string> = { titulo: r.titulo };
  if (r.acao === 'core.notify') {
    params.destino = r.destino;
    if (r.texto.trim() !== '') params.texto = r.texto;
    if (r.destino === 'usuario') params.usuario = r.usuario;
    if (r.destino === 'permissao') params.permissao = r.permissao;
  } else {
    params.dias = r.dias;
    params.responsavel = r.responsavel;
  }
  return JSON.stringify({
    nome: r.nome,
    gatilho: r.gatilho,
    condicoes: r.condicoes.map(({ campo, operador, valor }) => ({ campo, operador, valor })),
    acao: r.acao,
    params,
  });
}

/** A frase da regra enquanto ela é montada — a mesma que a lista mostra depois. */
export function resumo(r: Rascunho, opcoes: OpcoesDoEditor): string {
  const condicoes = r.condicoes.flatMap((c) => {
    const campo = campos(r.gatilho).find((d) => d.campo === c.campo);
    if (campo === undefined || c.valor.trim() === '') return [];
    const valor = campo.tipo === 'dinheiro' ? parseCents(c.valor) : c.valor.trim();
    if (valor === null) return [];
    return [descreverCondicao(r.gatilho, { campo: c.campo, operador: c.operador, valor })];
  });
  const params: Record<string, unknown> = {
    destino: r.destino,
    usuario: r.usuario,
    permissao: r.permissao,
    dias: Number(r.dias),
    responsavel: r.responsavel,
  };
  const se = condicoes.length === 0 ? '' : `, se ${condicoes.join(' e ')}`;
  return `Quando ${nomeDoGatilho(r.gatilho, opcoes.terms)}${se}, então ${descreverAcao(r.acao, params, opcoes)}.`;
}
