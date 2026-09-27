import { Avatar } from '@/components/ui/avatar';
import { TBody, TD, TH, THead, TR, Table, hrefDeOrdem } from '@/components/ui/table';
import { atrasoDaLinha } from '@/lib/utils';

import type { ChaveDeOrdem } from './state';

export interface PessoaListada {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  cargo: string | null;
  /** Já formatado: `529.982.247-25`. */
  documento: string | null;
  conta: string | null;
  responsavel: string | null;
}

export interface ContactRowsProps {
  pessoas: readonly PessoaListada[];
  /** Nome acessível da tabela — "Clientes", "Pacientes", o que o tenant chamar. */
  rotulo: string;
  /** Cabeçalho da coluna de vínculo, no vocabulário do tenant. */
  rotuloConta: string;
  /** O `?ordem=` normalizado, vindo de `ordemPedida()`. */
  ordem: string;
  /** O resto do endereço que os cabeçalhos precisam preservar (a busca). */
  params: Readonly<Record<string, string | null | undefined>>;
  /**
   * Coreografia de entrada. Só na primeira visita à rota: paginar, ordenar ou
   * filtrar são continuações da mesma leitura, e re-animar a lista a cada
   * clique transforma um filtro em espera (seção 8, regra 3).
   */
  animar: boolean;
}

/**
 * Em que largura cada coluna extra entra. O corte é sempre onde a coluna
 * deixaria de caber sem espremer o nome.
 *
 * `hidden` numa célula não a esconde no celular: o modo `blocos` do `<Table>`
 * força `display:block` em todo `td` com especificidade maior. É por isso que
 * `hidden xl:table-cell` significa "bloco no celular, escondida no meio, coluna
 * no monitor grande" — o dado nunca some do aparelho onde não há largura para
 * tabela nenhuma.
 *
 * Exportado porque o `loading.tsx` da rota desenha as mesmas colunas: esqueleto
 * com sete colunas onde a tabela mostra três promete um layout e entrega outro,
 * que é o defeito que um esqueleto existe para não cometer.
 */
export const VISIBILIDADE_DAS_COLUNAS = {
  nome: '',
  cargo: 'hidden xl:table-cell',
  conta: 'hidden md:table-cell',
  email: 'hidden lg:table-cell',
  telefone: 'hidden xl:table-cell',
  documento: 'hidden 2xl:table-cell',
  responsavel: 'hidden 2xl:table-cell',
} as const;

const COL = VISIBILIDADE_DAS_COLUNAS;

/** Célula sem dado. O travessão é desenho; quem ouve a página precisa da palavra. */
function Vazio() {
  return (
    <>
      <span aria-hidden>—</span>
      <span className="sr-only">não informado</span>
    </>
  );
}

/**
 * A lista de pessoas como tabela: colunas alinhadas, cabeçalho que ordena.
 *
 * Era um `<ul>` de blocos de ~68px dentro de 896px — 8 registros por tela em
 * 1080p, sem coluna para o olho descer e sem ordenação nenhuma. Na densidade
 * `larga` (44px) cabem 17, que é a meta da seção 5.
 *
 * Ordenar é `<Link>` com `?ordem=`: nenhum estado, nenhum `'use client'`, e a
 * ordem escolhida sobrevive ao recarregar e cabe num link mandado para alguém.
 */
export function ContactRows({
  pessoas,
  rotulo,
  rotuloConta,
  ordem,
  params,
  animar,
}: ContactRowsProps) {
  const ordenavel = (chave: ChaveDeOrdem) => ({
    chave,
    atual: ordem,
    href: hrefDeOrdem(params, chave, ordem),
  });

  return (
    <Table rotulo={rotulo}>
      <THead sticky>
        <tr>
          <TH ordem={ordenavel('nome')}>Nome</TH>
          <TH className={COL.cargo} ordem={ordenavel('cargo')}>
            Cargo
          </TH>
          <TH className={COL.conta}>{rotuloConta}</TH>
          <TH className={COL.email} ordem={ordenavel('email')}>
            E-mail
          </TH>
          <TH className={COL.telefone}>Telefone</TH>
          <TH className={COL.documento}>Documento</TH>
          <TH className={COL.responsavel}>Responsável</TH>
        </tr>
      </THead>

      <TBody>
        {pessoas.map((p, i) => (
          <TR
            key={p.id}
            href={`/crm/contatos/${p.id}`}
            rotulo={p.nome}
            className={animar ? 'animate-enter' : undefined}
            style={animar ? { animationDelay: atrasoDaLinha(i) } : undefined}
          >
            <TD truncar>
              <span className="flex min-w-0 items-center gap-2.5">
                {/* 24px é a medida de ícone da linha larga (seção 5); o disco é decorativo, o nome está ao lado. */}
                <Avatar nome={p.nome} tamanho="xs" />
                <span className="truncate font-medium text-content">{p.nome}</span>
              </span>
            </TD>

            <TD className={COL.cargo} rotulo="Cargo" truncar>
              {p.cargo ?? <Vazio />}
            </TD>

            <TD className={COL.conta} rotulo={rotuloConta} truncar>
              {p.conta ?? <Vazio />}
            </TD>

            <TD className={COL.email} rotulo="E-mail" truncar>
              {p.email ?? <Vazio />}
            </TD>

            <TD className={COL.telefone} rotulo="Telefone">
              {p.telefone ?? <Vazio />}
            </TD>

            {/* Documento em mono e `text-num`: a coluna é lida por dígito, não por palavra. */}
            <TD className={COL.documento} rotulo="Documento" numerico>
              {p.documento === null ? <Vazio /> : <span className="font-mono">{p.documento}</span>}
            </TD>

            <TD className={COL.responsavel} rotulo="Responsável" truncar>
              {p.responsavel ?? <Vazio />}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
