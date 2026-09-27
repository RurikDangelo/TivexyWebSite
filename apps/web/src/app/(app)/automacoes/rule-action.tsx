'use client';

import { Field, describedBy } from '@/components/form/field';
import { Input, Select } from '@/components/ui/input';

import { DICA_DO_PRAZO, type OpcoesDoEditor, type Rascunho } from './rule-draft';

export interface CamposDaAcaoProps {
  rascunho: Rascunho;
  /** Ids únicos: a mesma regra pode estar aberta duas vezes na página. */
  prefixo: string;
  opcoes: OpcoesDoEditor;
  problemas: Readonly<Record<string, string>>;
  /** O gatilho tem uma pessoa responsável pelo registro — nem todos têm. */
  temResponsavel: boolean;
  aoMudar: (parcial: Partial<Rascunho>) => void;
}

/**
 * O "para quem" do **então**, que muda inteiro conforme a ação escolhida.
 *
 * Avisar pede um destino (responsável, grupo ou pessoa); criar atividade pede
 * responsável e prazo. São dois formulários diferentes no mesmo lugar, e é por
 * isso que vivem num componente só, longe do resto do editor.
 */
export function CamposDaAcao({
  rascunho: r,
  prefixo,
  opcoes,
  problemas,
  temResponsavel,
  aoMudar,
}: CamposDaAcaoProps) {
  const id = (campo: string) => `${prefixo}-${campo}`;

  if (r.acao === 'core.notify') {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field nome={id('destino')} rotulo="Quem recebe" obrigatorio erro={problemas.destino}>
          <Select
            id={id('destino')}
            value={r.destino}
            onChange={(e) => aoMudar({ destino: e.target.value as Rascunho['destino'] })}
            aria-invalid={problemas.destino !== undefined}
            aria-describedby={describedBy(id('destino'), problemas.destino)}
          >
            {temResponsavel && (
              <option value="responsavel">A pessoa responsável pelo registro</option>
            )}
            <option value="permissao">Um grupo, pela permissão</option>
            <option value="usuario">Uma pessoa da equipe</option>
          </Select>
        </Field>

        {r.destino === 'permissao' && (
          <Field nome={id('permissao')} rotulo="Grupo" obrigatorio>
            <Select
              id={id('permissao')}
              value={r.permissao}
              onChange={(e) => aoMudar({ permissao: e.target.value })}
            >
              <option value="" disabled>
                Escolha…
              </option>
              {opcoes.permissoes.map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {p.rotulo}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {r.destino === 'usuario' && (
          <Field nome={id('usuario')} rotulo="Pessoa" obrigatorio>
            <Select
              id={id('usuario')}
              value={r.usuario}
              onChange={(e) => aoMudar({ usuario: e.target.value })}
            >
              <option value="" disabled>
                Escolha…
              </option>
              {opcoes.pessoas.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.nome}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
      <Field nome={id('responsavel')} rotulo="Para quem" obrigatorio erro={problemas.responsavel}>
        <Select
          id={id('responsavel')}
          value={r.responsavel}
          onChange={(e) => aoMudar({ responsavel: e.target.value })}
          aria-invalid={problemas.responsavel !== undefined}
          aria-describedby={describedBy(id('responsavel'), problemas.responsavel)}
        >
          <option value="responsavel">A pessoa responsável pelo registro</option>
          {opcoes.pessoas.map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.nome}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        nome={id('dias')}
        rotulo="Prazo (dias)"
        obrigatorio
        erro={problemas.dias}
        dica={DICA_DO_PRAZO}
      >
        <Input
          id={id('dias')}
          value={r.dias}
          onChange={(e) => aoMudar({ dias: e.target.value })}
          inputMode="numeric"
          className="tabular-nums"
          aria-invalid={problemas.dias !== undefined}
          aria-describedby={describedBy(id('dias'), problemas.dias, DICA_DO_PRAZO)}
        />
      </Field>
    </div>
  );
}
