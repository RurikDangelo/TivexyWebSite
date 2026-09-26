'use client';

import { LogOut, UserRound } from 'lucide-react';

import { sair } from '@/app/(auth)/actions';
import { Avatar } from '@/components/ui/avatar';
import {
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownSeparator,
} from '@/components/ui/dropdown-menu';

/**
 * Quem sou eu, e como saio.
 *
 * A empresa saiu daqui. Ela era a outra metade da pergunta "esta sessão é a que
 * eu penso que é?", e justamente por ser tão fácil de errar quanto a conta não
 * podia continuar a dois cliques dentro deste menu: agora é bloco de primeira
 * ordem no topo da coluna (`shell/tenant-switcher.tsx`).
 *
 * **Sair é POST, não link.** Um `<a href="/sair">` seria disparado por um
 * `<img src="/sair">` em qualquer página — e, pior, pelo próprio navegador ao
 * pré-carregar o link. O formulário com Server Action carrega a proteção de
 * origem do Next, que um GET não tem.
 *
 * O teclado é do `<DropdownMenu>`: o menu anterior declarava `role="menu"` sem
 * seta, sem Home/End e sem Escape — um menu que o leitor de tela anunciava como
 * navegável e que só o mouse abria.
 */
export function UserMenu({ email }: { email: string | null }) {
  const conta = email ?? 'Sem e-mail';

  return (
    <DropdownMenu
      rotulo="Conta"
      alinhamento="fim"
      classNameGatilho="rounded-pill p-0.5 hover:bg-surface-muted"
      className="min-w-56"
      gatilho={
        /* O nome acessível do gatilho vem do `rotulo` do Avatar: o disco é decorativo. */
        <Avatar nome={nomeParaODisco(email)} tamanho="sm" tom="brand" rotulo={`Conta: ${conta}`} />
      }
    >
      <DropdownLabel>Conectado como</DropdownLabel>
      {/*
       * `presentation` porque só `menuitem`, `separator` e `group` são filhos
       * legítimos de um `menu` — um parágrafo solto viraria ruído na travessia.
       * O e-mail já é anunciado pelo nome do gatilho.
       */}
      <div role="presentation" className="truncate px-2.5 pb-2 text-label text-content">
        {conta}
      </div>

      <DropdownSeparator />

      <DropdownItem href="/conta" Icone={UserRound}>
        Minha conta
      </DropdownItem>

      <form action={sair}>
        <DropdownItem type="submit" Icone={LogOut}>
          Sair
        </DropdownItem>
      </form>
    </DropdownMenu>
  );
}

/**
 * Duas iniciais a partir do e-mail: "rurik.dangelo@…" → "RD".
 *
 * O `Avatar` corta por espaço, e um e-mail não tem nenhum. Ponto, hífen e
 * sublinhado são o que separa nome de sobrenome num endereço — sem isso todo
 * mundo vira uma letra só, e dois colegas da mesma empresa ficam idênticos.
 */
function nomeParaODisco(email: string | null): string {
  if (email === null) return '?';
  const local = email.split('@')[0] ?? email;
  const separado = local.replace(/[._-]+/g, ' ').trim();
  return separado === '' ? email : separado;
}
