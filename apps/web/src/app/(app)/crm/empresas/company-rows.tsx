import { SearchX } from 'lucide-react';
import Link from 'next/link';

import { Avatar } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { TBody, TD, TH, THead, TR, Table, TableEmpty, hrefDeOrdem } from '@/components/ui/table';
import { atrasoDaLinha } from '@/lib/utils';

import type { ChaveDeOrdemDeConta } from './state';

export interface ContaListada {
  id: string;
  nome: string;
  razaoSocial: string | null;
  /** Já formatado: `12.ABC.345/01DE-35`. */
  documento: string | null;
  email: string | null;
  telefone: string | null;
  /** Nome de quem responde pela conta, ou `null` se saiu da empresa. */
  responsavel: string | null;
}

/*
 * Colunas que só entram quando há largura.
 *
 * O recorte é `md:max-*:hidden`, e não `hidden xl:table-cell`, porque abaixo de
 * `md` a `<Table>` deixa de ser tabela e vira bloco rotulado: ali não há
 * competição por largura e esconder coluna só faria o dado existir sem ninguém
 * achar. No celular aparecem todas; o corte vale para a faixa do meio.
 */
const A_PARTIR_DE_LG = 'md:max-lg:hidden';
const A_PARTIR_DE_XL = 'md:max-xl:hidden';

export interface ColunaDaLista {
  rotulo: string;
  /** `null` na coluna que não se ordena. */
  chave: ChaveDeOrdemDeConta | null;
  /** A partir de que largura a coluna entra. Ausente é sempre. */
  classe?: string;
}

/**
 * Os cabeçalhos da lista, na ordem.
 *
 * Exportados porque o `loading.tsx` da rota monta a MESMA tabela com linhas de
 * esqueleto: é assim que o esqueleto tem a forma do que vai chegar, em vez de
 * prometer um layout e entregar outro.
 */
export const COLUNAS_DA_LISTA: readonly ColunaDaLista[] = [
  { rotulo: 'Nome', chave: 'nome' },
  { rotulo: 'Razão social', chave: 'razao', classe: A_PARTIR_DE_XL },
  { rotulo: 'CNPJ ou CPF', chave: 'documento' },
  { rotulo: 'E-mail', chave: 'email' },
  { rotulo: 'Telefone', chave: null, classe: A_PARTIR_DE_LG },
  { rotulo: 'Responsável', chave: null, classe: A_PARTIR_DE_XL },
];

export interface CompanyRowsProps {
  contas: readonly ContaListada[];
  /** O `?ordem=` vigente. `null` é a ordem padrão da consulta, e nenhuma seta acesa. */
  ordem: string | null;
  /** O que o clique no cabeçalho precisa preservar — hoje, a busca. */
  params: Readonly<Record<string, string | null>>;
  /** O termo buscado. Vazio muda o significado de uma tabela sem linhas. */
  busca: string;
  /**
   * Escalonar a entrada das linhas.
   *
   * Falso ao paginar, filtrar ou reordenar: a coreografia é da primeira
   * chegada à rota, e repeti-la a cada clique transforma navegação em espera
   * (seção 8, regra 3).
   */
  animar: boolean;
  /** Rótulo plural do vocabulário do tenant, para o nome acessível da tabela. */
  rotuloPlural: string;
}

/** A lista de contas. Só desenha: a página decide o que entra e em que ordem. */
export function CompanyRows({
  contas,
  ordem,
  params,
  busca,
  animar,
  rotuloPlural,
}: CompanyRowsProps) {
  const coluna = (chave: ChaveDeOrdemDeConta) => ({
    chave,
    atual: ordem,
    href: hrefDeOrdem(params, chave, ordem),
  });

  return (
    <Table densidade="larga" rotulo={`Lista de ${rotuloPlural}`}>
      <THead sticky>
        <TR>
          {COLUNAS_DA_LISTA.map((col) => (
            <TH
              key={col.rotulo}
              className={col.classe}
              ordem={col.chave === null ? undefined : coluna(col.chave)}
            >
              {col.rotulo}
            </TH>
          ))}
        </TR>
      </THead>

      <TBody>
        {contas.length === 0 ? (
          /*
           * Aqui só chega o vazio de busca: a página trata "ainda não há
           * cadastro" e "não consegui ler" antes de montar a tabela. Manter o
           * cabeçalho de pé é o que permite afrouxar o filtro sem recarregar a
           * ideia da tela.
           */
          <TableEmpty
            colunas={COLUNAS_DA_LISTA.length}
            icone={SearchX}
            titulo="Nada encontrado"
            acao={
              <Link href="/crm/empresas" className={buttonVariants({ variant: 'outline' })}>
                Limpar a busca
              </Link>
            }
          >
            Nenhum cadastro tem “{busca}” no nome, razão social, e-mail, telefone, site ou
            documento. O cadastro pode existir com outra grafia — tente parte do nome, ou só os
            números do documento.
          </TableEmpty>
        ) : (
          contas.map((c, i) => (
            <TR
              key={c.id}
              href={`/crm/empresas/${c.id}`}
              rotulo={`Abrir ${c.nome}`}
              className={animar ? 'animate-enter' : undefined}
              style={animar ? { animationDelay: atrasoDaLinha(i) } : undefined}
            >
              <TD truncar rotulo="Nome">
                <span className="flex min-w-0 items-center gap-2.5">
                  <Avatar nome={c.nome} tamanho="xs" />
                  <span className="min-w-0 truncate font-medium text-content">{c.nome}</span>
                </span>
              </TD>

              <TD truncar rotulo="Razão social" className={A_PARTIR_DE_XL}>
                {c.razaoSocial ?? <NaoInformado />}
              </TD>

              {/*
               * Documento em mono, mas sem `numerico`: o CNPJ novo tem letra, e
               * alinhar à direita como se fosse cifra o afastaria do nome, que é
               * com quem ele se lê.
               */}
              <TD rotulo="CNPJ ou CPF" className="whitespace-nowrap">
                {c.documento === null ? (
                  <NaoInformado />
                ) : (
                  <span className="font-mono">{c.documento}</span>
                )}
              </TD>

              <TD truncar rotulo="E-mail">
                {c.email ?? <NaoInformado />}
              </TD>

              <TD truncar rotulo="Telefone" className={A_PARTIR_DE_LG}>
                {c.telefone ?? <NaoInformado />}
              </TD>

              <TD truncar rotulo="Responsável" className={A_PARTIR_DE_XL}>
                {c.responsavel ?? <NaoInformado />}
              </TD>
            </TR>
          ))
        )}
      </TBody>
    </Table>
  );
}

/** O travessão é desenho; quem ouve a página precisa da palavra. */
function NaoInformado() {
  return (
    <span className="text-content-subtle">
      <span aria-hidden>—</span>
      <span className="sr-only">não informado</span>
    </span>
  );
}
