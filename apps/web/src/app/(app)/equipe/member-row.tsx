import { Ban } from 'lucide-react';
import type { ReactNode } from 'react';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { TD, TR } from '@/components/ui/table';
import { atrasoDaLinha } from '@/lib/utils';

import { SITUACAO, type MembroNaTela } from './state';

/** Quantas colunas a tabela tem com e sem a coluna de ações. O vazio e o erro de linha atravessam todas. */
export function colunasDaTabela(podeEditar: boolean): number {
  return podeEditar ? 6 : 5;
}

export interface LinhaDaPessoaProps {
  membro: MembroNaTela;
  /**
   * Célula de ações. Ausente, a coluna não existe — quem só pode ler não
   * recebe uma coluna vazia nem o JavaScript do menu.
   */
  acoes?: ReactNode;
  /**
   * Escalonar a entrada. Só na primeira pintura da rota: filtrar, ordenar ou
   * paginar não re-executa a coreografia (seção 8, regra 3).
   */
  animar?: boolean;
  indice: number;
}

/**
 * Uma pessoa da equipe, em forma de linha.
 *
 * Uma linha de texto por célula, e o e-mail em coluna própria em vez de
 * empilhado sob o nome: é isso que mantém a altura em 44px (`linha-larga`, e
 * daí o avatar de 24px) e leva a lista dos 8 registros visíveis de antes para
 * cerca de 15 em 1080p. Empilhar dois textos economiza uma coluna e custa
 * metade da tela.
 *
 * Sem `'use client'` de propósito, e é isso que o arquivo existe para
 * garantir: a mesma marcação serve à página (Server Component, quem só lê) e
 * ao `MemberRow` de `team-forms.tsx` (cliente, quem também escreve).
 * Duplicar as células nos dois lugares é como as colunas passam a divergir.
 */
export function LinhaDaPessoa({ membro, acoes, animar = false, indice }: LinhaDaPessoaProps) {
  const situacao = SITUACAO[membro.status];

  return (
    <TR
      className={animar ? 'animate-enter' : undefined}
      style={animar ? { animationDelay: atrasoDaLinha(indice) } : undefined}
    >
      {/*
       * Sem `rotulo`: no modo blocos o rótulo fica à esquerda e o valor à
       * direita, e a célula principal do registro quer a largura inteira.
       */}
      <TD truncar>
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar nome={membro.nome} tamanho="xs" />
          <span className="truncate text-label text-content">{membro.nome}</span>
          {membro.voce && (
            <Badge tone="brand" tamanho="xs">
              Você
            </Badge>
          )}
        </span>
      </TD>

      <TD rotulo="E-mail" truncar className="text-content-muted">
        {membro.email ?? (
          <>
            <span aria-hidden>—</span>
            <span className="sr-only">sem e-mail</span>
          </>
        )}
      </TD>

      <TD rotulo="Papel" truncar>
        {membro.papel}
      </TD>

      <TD rotulo="Situação">
        {/*
         * Cor nunca sozinha: o selo carrega a palavra, e `success`/`warning`
         * já trazem símbolo do próprio Badge. Só `suspended` é neutro, então
         * o símbolo dele vem à mão.
         */}
        <Badge tone={situacao.tom} Icone={membro.status === 'suspended' ? Ban : undefined}>
          {situacao.rotulo}
        </Badge>
      </TD>

      <TD rotulo="No acesso desde" className="text-num whitespace-nowrap text-content-muted">
        {membro.desde ?? (
          <>
            <span aria-hidden>—</span>
            <span className="sr-only">ainda não entrou</span>
          </>
        )}
      </TD>

      {acoes !== undefined && <TD acoes>{acoes}</TD>}
    </TR>
  );
}
