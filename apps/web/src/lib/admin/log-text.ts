/**
 * A auditoria de plataforma, dita como se fala: "Plano trocado — essencial →
 * profissional · ligou ERP, Estoque". O `metadata` é o que as funções de
 * 20260925140000 gravam; aqui ele vira frase.
 */

import { formatDocument } from '@tivexy/core';

/** O que a auditoria guardou, dito como se fala. */
export function detalheDoRegistro(
  acao: string,
  metadata: Readonly<Record<string, unknown>>,
  nomeDoModulo: (codigo: string) => string,
): string | null {
  const texto = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);
  const lista = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map(nomeDoModulo) : [];
  switch (acao) {
    case 'tenant.suspended':
      return texto(metadata.motivo) === null ? null : `Motivo: ${texto(metadata.motivo)}`;
    case 'tenant.plan_changed': {
      const partes = [`${texto(metadata.de) ?? 'sem plano'} → ${texto(metadata.para) ?? '?'}`];
      const ligados = lista(metadata.ligados);
      const desligados = lista(metadata.desligados);
      if (ligados.length > 0) partes.push(`ligou ${ligados.join(', ')}`);
      if (desligados.length > 0) partes.push(`desligou ${desligados.join(', ')}`);
      return partes.join(' · ');
    }
    case 'tenant.updated': {
      const antes = (metadata.antes ?? {}) as Record<string, unknown>;
      const depois = (metadata.depois ?? {}) as Record<string, unknown>;
      const rotulos: Record<string, string> = {
        nome: 'nome',
        razao_social: 'razão social',
        documento: 'documento',
      };
      const mostrar = (chave: string, v: unknown) => {
        const t = texto(v);
        if (t === null) return 'vazio';
        return chave === 'documento' ? formatDocument(t) : t;
      };
      const mudou = Object.keys(rotulos).filter((k) => antes[k] !== depois[k]);
      if (mudou.length === 0) return 'Nada mudou';
      return mudou
        .map((k) => `${rotulos[k]}: ${mostrar(k, antes[k])} → ${mostrar(k, depois[k])}`)
        .join(' · ');
    }
    default:
      return null;
  }
}
