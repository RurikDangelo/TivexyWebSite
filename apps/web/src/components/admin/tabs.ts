/**
 * O CATÁLOGO das abas do painel da plataforma.
 *
 * Existe pelo mesmo motivo que `config/navigation.ts`: uma lista só, em um
 * arquivo só, que a casca desenha e o teste confere contra o disco. O defeito
 * que ele evita é o mesmo — aba que promete tela que não existe, e tela que
 * existe sem entrada nenhuma.
 *
 * **Não há decisão de acesso aqui.** Quem decide é `routeRules`, e ela é uma
 * linha só: `/adminpanel` é `superAdmin`, e o layout do route group chama
 * `requireAccess('/adminpanel')` antes de qualquer aba renderizar. Filtrar aba
 * por papel seria uma segunda lista de permissão, que é o que este repositório
 * não faz.
 *
 * ## Por que `status` existe aqui também
 *
 * O dono pediu seis abas, com a referência do painel da NIT: Clientes,
 * Usuários, Domínios, Ramos, Anúncios e Configurações. Quatro têm tela. Duas
 * não têm nada — nem tabela, nem regra, nem decisão tomada. A regra inegociável
 * do CLAUDE.md não deixa desenhar uma aba que abre uma tela vazia fingindo
 * recurso, e sumir com elas faria o dono procurar de novo o que ele já pediu.
 *
 * Então elas aparecem **declaradas e não navegáveis**, com a palavra escrita —
 * o mesmo mecanismo que `navigation.ts` usa para "Equipes". Ver
 * `admin-tabs.tsx`, que desenha as duas formas.
 */

/** Estado real da aba. `pendente` não vira link: não há para onde ir. */
export type StatusDaAba = 'pronta' | 'pendente';

interface AbaBase {
  /** Chave estável da aba — é o que `Tabs` compara para marcar a ativa. */
  chave: string;
  rotulo: string;
  /**
   * Uma linha sobre o que a aba faz **hoje**. Nem promessa, nem ressalva
   * escondida: "o DNS curinga não existe" é informação.
   */
  descricao: string;
}

/**
 * União discriminada, e não um `motivo?: string`: assim o compilador cobra o
 * motivo de toda aba nova que nasça `pendente`. Uma aba sem tela e sem
 * explicação é exatamente o buraco que esta estrutura existe para fechar.
 */
export type AbaDoAdmin =
  | (AbaBase & { status: 'pronta'; href: string })
  | (AbaBase & { status: 'pendente'; href: null; motivo: string });

export const ABAS = [
  {
    chave: 'clientes',
    rotulo: 'Clientes',
    href: '/adminpanel',
    descricao: 'As empresas da plataforma e os provisionamentos que pararam no meio',
    status: 'pronta',
  },
  {
    chave: 'usuarios',
    rotulo: 'Usuários',
    href: '/adminpanel/usuarios',
    descricao: 'Quem tem vínculo com cada empresa, e o link de acesso de cada um',
    status: 'pronta',
  },
  {
    chave: 'ramos',
    rotulo: 'Ramos',
    href: '/adminpanel/ramos',
    descricao: 'Os nichos que o provisionamento oferece e o que cada um cria',
    status: 'pronta',
  },
  {
    chave: 'dominios',
    rotulo: 'Domínios',
    href: '/adminpanel/dominios',
    descricao: 'O endereço por subdomínio — bloqueado por dependência externa',
    status: 'pronta',
  },
  {
    /*
     * Pedida pelo dono, e não existe nada por baixo: nenhuma tabela, nenhum
     * lugar onde um anúncio seria exibido, nenhuma decisão sobre para quem ele
     * apareceria. Uma aba navegável aqui abriria uma tela que só diz "vazio",
     * e uma tela vazia é lida como "ainda não cadastrei" — não como "não
     * existe". Declarada e sem link é a diferença entre as duas frases.
     */
    chave: 'anuncios',
    rotulo: 'Anúncios',
    href: null,
    descricao: 'Avisar clientes de dentro do produto',
    status: 'pendente',
    motivo:
      'Não existe nada por baixo: nem tabela, nem lugar no produto onde um anúncio apareceria. ' +
      'Antes de virar tela, precisa de uma decisão sobre o que é um anúncio aqui — quem vê, onde e por quanto tempo.',
  },
  {
    /*
     * Mesma situação. As configurações que existem hoje são do tenant
     * (`/configuracoes`, tabela `tenant_settings`); configuração DA PLATAFORMA
     * não tem tabela nem catálogo.
     */
    chave: 'configuracoes',
    rotulo: 'Configurações',
    href: null,
    descricao: 'Ajustes da plataforma, não de um cliente',
    status: 'pendente',
    motivo:
      'As configurações que existem hoje são de cada empresa, em tenant_settings, na tela /configuracoes. ' +
      'Configuração da plataforma não tem tabela nem catálogo — não há o que editar.',
  },
] as const satisfies readonly AbaDoAdmin[];

/** As abas que têm tela, na ordem. É o que vira link. */
export const ABAS_COM_TELA = ABAS.filter(
  (aba): aba is Extract<(typeof ABAS)[number], { status: 'pronta' }> => aba.status === 'pronta',
);

/**
 * As abas pedidas que não têm tela.
 *
 * O predicado é explícito porque `filter` não estreita sozinho: sem ele,
 * `motivo` não existiria no tipo e quem desenha teria de fingir que existe.
 */
export const ABAS_PENDENTES = ABAS.filter(
  (aba): aba is Extract<(typeof ABAS)[number], { status: 'pendente' }> => aba.status === 'pendente',
);

/** Um caminho que existe no painel. Link para caminho inventado não compila. */
export type AbaHref = (typeof ABAS_COM_TELA)[number]['href'];

/**
 * A chave de uma aba navegável.
 *
 * Existe para `abaAtiva` devolver a união, e não `string`: o `Tabs` tipa
 * `ativa` como `NoInfer<Chave>` justamente para que uma chave que não está na
 * lista não compile — devolver `string` daqui jogaria essa rede fora.
 */
export type AbaChave = (typeof ABAS_COM_TELA)[number]['chave'];

/**
 * Qual aba este caminho ativa.
 *
 * O mais específico vence, pela mesma razão do `trilhaDoHeader` da casca do
 * cliente: `/adminpanel/clientes/novo` é Clientes, e não a raiz por acaso.
 *
 * A raiz do painel é a lista de clientes, então `/adminpanel/clientes/...`
 * também é Clientes — o filho mora sob `/clientes` porque é o que já era, e
 * mudar o caminho de uma tela em produção não era o pedido.
 */
export function abaAtiva(pathname: string): AbaChave {
  const caminho = pathname.toLowerCase();
  let melhor: { chave: AbaChave; tamanho: number } | null = null;

  for (const aba of ABAS_COM_TELA) {
    const prefixo = aba.href.toLowerCase();
    if (caminho !== prefixo && !caminho.startsWith(`${prefixo}/`)) continue;
    if (melhor === null || prefixo.length > melhor.tamanho) {
      melhor = { chave: aba.chave, tamanho: prefixo.length };
    }
  }

  /* `/adminpanel/clientes/novo` não casa com nenhuma aba além da raiz — e casa com ela. */
  return melhor?.chave ?? 'clientes';
}
