'use client';

import { Building2, ChevronsUpDown } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { trocarEmpresa } from '@/app/(app)/actions';
import { Avatar } from '@/components/ui/avatar';
import { DropdownItem, DropdownLabel, DropdownMenu } from '@/components/ui/dropdown-menu';
import { Tooltip } from '@/components/ui/tooltip';
import type { TenantOption } from '@/lib/auth/active-tenant';
import { cn } from '@/lib/utils';

/**
 * Em que empresa esta sessão está — no topo da coluna, não escondido num menu.
 *
 * O `user-menu.tsx` carregava a troca de empresa dentro do dropdown de conta, e
 * só quando havia mais de uma; no celular o nome da empresa ativa sumia por
 * completo. O comentário daquele arquivo dizia que "errar a empresa é tão fácil
 * quanto errar a conta, e as duas terminam em alguém lançando dado no lugar
 * errado" — e a interface contradizia o comentário.
 *
 * Por isso este bloco **sempre aparece**, inclusive com uma empresa só: aí ele
 * não abre lista nenhuma, e serve só para dizer onde a pessoa está. Contexto é
 * informação mesmo quando não há escolha a fazer.
 */

/** O tamanho do disco é o mesmo do `Avatar tamanho="sm"`: 32px. */
const AVATAR = 'rounded-card';

/** Linha do bloco, compartilhada pelo botão, pelo link e pelo texto estático. */
const LINHA =
  'flex h-[var(--header-h)] w-full items-center gap-2.5 px-3 text-left transition-colors transition-base';

export interface TenantSwitcherProps {
  empresa: TenantOption | null;
  /** Tudo que esta pessoa alcança. Vazio em quem ainda não tem vínculo. */
  empresas: readonly TenantOption[];
  /**
   * A segunda linha: o papel desta pessoa nesta empresa.
   *
   * `null` quando não se sabe — e aí a linha não é desenhada. O nome do papel
   * (`roles.name`) existe no banco, mas não chega à sessão hoje; inventar
   * "Administrador" aqui seria apresentar como real o que não foi lido.
   */
  papel: string | null;
  /** Trilho de 64px: sobra o disco, e o nome vai para a dica. */
  colapsada?: boolean;
  /**
   * Como a troca é oferecida.
   *
   * `menu` usa o `<DropdownMenu>`, que manda o painel para um portal no
   * `<body>`. Dentro da gaveta mobile isso seria fatal: a gaveta é um
   * `<dialog>` modal, e tudo que fica fora dela na top layer nasce inerte — o
   * menu apareceria atrás do véu, sem receber clique. Ali a lista é `lista`,
   * desenhada dentro da própria gaveta.
   */
  apresentacao?: 'menu' | 'lista';
  /** Fecha a gaveta quando a troca acontece dentro dela. */
  aoNavegar?: () => void;
  className?: string;
}

export function TenantSwitcher({
  empresa,
  empresas,
  papel,
  colapsada = false,
  apresentacao = 'menu',
  aoNavegar,
  className,
}: TenantSwitcherProps) {
  const nome = empresa?.name ?? 'Sem empresa';
  const podeTrocar = empresas.length > 1;

  const identidade = (
    <>
      {/*
       * Sem `src`: o `Avatar` sabe mostrar o logo do cliente, e o banco já
       * guarda o caminho em `tenants.brand_logo_path`, mas ele não chega aqui —
       * `TenantOption` (lib/auth/active-tenant.ts) e `my_tenants()` não trazem
       * a coluna. Passar uma URL montada no cliente seria inventar um endereço.
       */}
      <Avatar nome={nome} tamanho="sm" tom="brand" className={AVATAR} />
      {!colapsada && (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-label text-content">{nome}</span>
          {papel !== null && (
            <span className="truncate text-caption text-content-subtle">{papel}</span>
          )}
        </span>
      )}
    </>
  );

  /* A dica só existe no trilho: com o nome escrito ao lado ela seria eco. */
  const dica = papel === null ? nome : `${nome} — ${papel}`;

  /* Sem nenhuma empresa alcançável não há contexto nem escolha: só o estado. */
  if (empresa === null && empresas.length === 0) {
    return (
      <ComDica ativa={colapsada} conteudo="Nenhuma empresa vinculada a esta conta">
        <div className={cn(LINHA, 'cursor-default', colapsada && 'justify-center px-0', className)}>
          {identidade}
          {colapsada && <span className="sr-only">Nenhuma empresa vinculada a esta conta</span>}
        </div>
      </ComDica>
    );
  }

  /*
   * Alcança empresas, mas nenhuma foi decidida — o Super Admin sem cookie, ou
   * quem chegou por um endereço que não nomeia empresa. A saída é a tela de
   * escolha, que hoje não tem entrada nenhuma na navegação.
   */
  if (empresa === null) {
    return (
      <ComDica ativa={colapsada} conteudo="Escolher empresa">
        <Link
          href="/empresas"
          onClick={aoNavegar}
          className={cn(
            LINHA,
            'hover:bg-surface-muted',
            colapsada && 'justify-center px-0',
            className,
          )}
        >
          {identidade}
          {colapsada ? (
            <span className="sr-only">Escolher empresa</span>
          ) : (
            <ChevronsUpDown className="size-4 shrink-0 text-content-subtle" aria-hidden />
          )}
        </Link>
      </ComDica>
    );
  }

  /* Uma empresa só: contexto sem lista. Um menu de um item pede um clique que não decide nada. */
  if (!podeTrocar) {
    return (
      <ComDica ativa={colapsada} conteudo={dica}>
        <div className={cn(LINHA, 'cursor-default', colapsada && 'justify-center px-0', className)}>
          {identidade}
          {colapsada && <span className="sr-only">{dica}</span>}
        </div>
      </ComDica>
    );
  }

  if (apresentacao === 'lista') {
    return (
      <div className={cn('flex flex-col', className)}>
        <div className={cn(LINHA, 'cursor-default')}>{identidade}</div>
        <ListaDeEmpresas empresa={empresa} empresas={empresas} />
      </div>
    );
  }

  return (
    <ComDica ativa={colapsada} conteudo={dica}>
      <DropdownMenu
        rotulo="Trocar de empresa"
        alinhamento="inicio"
        classNameGatilho={cn(
          LINHA,
          /* O gatilho do primitivo nasce `rounded-control`; aqui ele é um bloco de borda a borda. */
          'rounded-none hover:bg-surface-muted',
          colapsada && 'justify-center px-0',
          className,
        )}
        className="min-w-64"
        gatilho={
          <>
            {identidade}
            {colapsada ? (
              <span className="sr-only">{dica}. Trocar de empresa</span>
            ) : (
              <ChevronsUpDown className="size-4 shrink-0 text-content-subtle" aria-hidden />
            )}
          </>
        }
      >
        <DropdownLabel>Empresas</DropdownLabel>
        {/*
         * A lista é completa: são as mesmas empresas que `/empresas` mostraria.
         * Por isso não há um "ver todas" aqui — ele levaria à mesma lista que
         * já está aberta. O item "Trocar de empresa" do rodapé continua sendo
         * o caminho para quem prefere a tela.
         */}
        {empresas.map((opcao) => (
          <FormaDeTroca key={opcao.id} slug={opcao.slug}>
            {/* Trocar recarrega a página inteira; o menu fecha junto com ela. */}
            <DropdownItem type="submit" Icone={Building2} selecionado={opcao.id === empresa.id}>
              {opcao.name}
            </DropdownItem>
          </FormaDeTroca>
        ))}
      </DropdownMenu>
    </ComDica>
  );
}

/**
 * A troca é POST com Server Action, nunca link.
 *
 * Um `<a href="/empresas/acme">` que grava cookie é mudança de estado por GET:
 * o navegador pré-carrega link, o antivírus abre link, o leitor de tela
 * percorre link — qualquer um deles trocaria a empresa sem ninguém clicar.
 */
function FormaDeTroca({ slug, children }: { slug: string; children: ReactNode }) {
  return (
    <form action={trocarEmpresa}>
      <input type="hidden" name="slug" value={slug} />
      {children}
    </form>
  );
}

/** A mesma lista, desenhada dentro da gaveta — onde o portal do dropdown não alcança. */
function ListaDeEmpresas({
  empresa,
  empresas,
}: {
  empresa: TenantOption;
  empresas: readonly TenantOption[];
}) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-line-subtle px-2 py-2">
      <p className="px-2 pb-1 text-eyebrow uppercase text-content-subtle">Trocar de empresa</p>
      {empresas.map((opcao) => {
        const ativa = opcao.id === empresa.id;
        return (
          <FormaDeTroca key={opcao.id} slug={opcao.slug}>
            <button
              type="submit"
              /* A empresa ativa não é destino: clicar nela recarregaria para o mesmo lugar. */
              disabled={ativa}
              aria-current={ativa ? 'true' : undefined}
              className={cn(
                'flex min-h-9 w-full items-center gap-2.5 rounded-control px-2 py-1.5 text-left text-label transition-colors transition-base',
                ativa
                  ? 'bg-surface-accent-strong text-content'
                  : 'text-content-default hover:bg-surface-muted hover:text-content',
              )}
            >
              <Building2 className="size-4 shrink-0 opacity-70" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{opcao.name}</span>
              {ativa && <span className="shrink-0 text-caption text-content-subtle">atual</span>}
            </button>
          </FormaDeTroca>
        );
      })}
    </div>
  );
}

/**
 * Embrulha na dica só quando ela acrescenta algo.
 *
 * Colapsada, o nome da empresa não está escrito em lugar nenhum — o disco com
 * a inicial não identifica ninguém. Expandida, a dica repetiria o texto que
 * está a 8px dela.
 */
function ComDica({
  ativa,
  conteudo,
  children,
}: {
  ativa: boolean;
  conteudo: string;
  children: ReactNode;
}) {
  if (!ativa) return children;

  /*
   * O `<span>` intermediário não é enfeite: o `Tooltip` clona o filho para
   * pendurar `aria-describedby` nele, e o `DropdownMenu` não aceita atributos
   * de HTML. O foco borbulha, então a dica ainda abre pelo teclado.
   */
  return (
    <Tooltip conteudo={conteudo} lado="direita" className="w-full">
      <span className="flex w-full">{children}</span>
    </Tooltip>
  );
}
