/**
 * O estado dos formulários de marca e de módulos, e o endereço do Admin.
 *
 * Fora de `brand.ts` e de `modules.ts` pela regra do Next: arquivo `'use
 * server'` só exporta função assíncrona. É a mesma separação que
 * `app/(auth)/form-state.ts` já faz.
 */

import type { ModuleCode } from '@tivexy/core';

/**
 * A raiz do painel de plataforma.
 *
 * Uma constante, e não a string repetida em seis lugares, porque ela aparece
 * duas vezes em cada ação — na guarda e na revalidação — e as duas **têm** que
 * andar juntas: revalidar `/admin` depois de mudar de endereço deixaria a tela
 * nova servindo dado velho, em silêncio.
 *
 * Constante de módulo não é o mesmo que ler o caminho de um cabeçalho, que é o
 * que `lib/auth/require.ts` proíbe: este valor é fixo em tempo de compilação e
 * não chega na requisição. O que ele exige é que
 * `config/routes.ts` tenha a regra `superAdmin` **neste** prefixo — ver a
 * conferência explícita em cada ação.
 */
export const ADMIN_BASE = '/adminpanel';

/** O retorno das ações de marca. `FormFeedback` consome `erro`/`ok` direto. */
export interface MarcaState {
  erro: string | null;
  ok: string | null;
  /** Erro do campo de cor, quando é a cor que está errada. */
  cor?: string;
  /** Quantas vezes deu certo — a `key` que limpa o campo de arquivo já enviado. */
  rodada: number;
}

export const MARCA_INICIAL: MarcaState = { erro: null, ok: null, rodada: 0 };

/**
 * O retorno das ações de módulo.
 *
 * `codigo` existe para a tela pôr a mensagem **na linha do módulo** que a
 * gerou. Sem ele, ligar Estoque e ver "pronto" no alto da página não diz o que
 * ficou pronto quando há nove interruptores.
 */
export interface ModulosState {
  erro: string | null;
  ok: string | null;
  codigo: ModuleCode | null;
}

export const MODULOS_INICIAL: ModulosState = { erro: null, ok: null, codigo: null };

/** Um módulo como o painel o mostra. */
export interface ModuloDoCliente {
  codigo: ModuleCode;
  nome: string;
  ligado: boolean;
  /**
   * O plano atual inclui este módulo?
   *
   * É informação diferente de `ligado`, e por isso são dois campos: ligado
   * fora do plano é módulo avulso (cortesia, piloto, migração), e desligado
   * dentro do plano é algo que o cliente está pagando e não recebe.
   */
  noPlano: boolean;
  /** Módulo fora de catálogo (`modules.is_active = false`): não dá para ligar. */
  emCatalogo: boolean;
}
