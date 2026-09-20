/**
 * De qual tenant é esta requisição, lido do endereço.
 *
 * `tenants.slug` é o subdomínio — está no comentário da própria coluna:
 * "mudar quebra todos os links existentes". Então `acme.tivexy.com.br` é o
 * tenant `acme`, e descobrir isso é ler o host.
 *
 * Função pura, sem I/O: recebe o cabeçalho `Host`, devolve um slug ou `null`.
 * **`null` não é erro** — é "o endereço não diz qual tenant", que é o caso
 * normal em `tivexy.com.br`, em `app.tivexy.com.br` e em desenvolvimento. Quem
 * chama decide o que fazer: normalmente perguntar à sessão, porque quem tem um
 * vínculo só não precisa escolher nada.
 *
 * O que **não** está aqui: verificar se o tenant existe. Isso é consulta ao
 * banco, e misturar as duas coisas transformaria uma regra de string num módulo
 * que precisa de conexão para ser testado.
 */

/**
 * Subdomínios que a plataforma usa, e que por isso nenhum tenant pode ter.
 *
 * A lista vale nos **dois sentidos**, e é isso que a torna útil. Ela impede
 * `www.tivexy.com.br` de ser lido como o tenant "www" — e impede que alguém
 * crie um tenant chamado "www", que nasceria inalcançável porque o endereço
 * dele apontaria para outra coisa. Reservar só na leitura seria deixar a
 * armadilha armada do lado da escrita.
 *
 * Inclui nomes que ainda não usamos (`api`, `cdn`, `status`) de propósito:
 * liberar um nome depois é fácil; tomar de volta um nome que virou o endereço
 * de um cliente, não.
 */
export const RESERVED_SUBDOMAINS: readonly string[] = [
  'admin',
  'api',
  'app',
  'assets',
  'auth',
  'blog',
  'cdn',
  'dashboard',
  'dev',
  'docs',
  'ftp',
  'help',
  'mail',
  'painel',
  'preview',
  'sandbox',
  'smtp',
  'staging',
  'static',
  'status',
  'suporte',
  'support',
  'test',
  'tivexy',
  'webmail',
  'www',
];

const RESERVADOS = new Set(RESERVED_SUBDOMAINS);

export function isReservedSubdomain(slug: string): boolean {
  return RESERVADOS.has(slug.trim().toLowerCase());
}

/**
 * Domínios onde o primeiro rótulo do host é o tenant.
 *
 * `localhost` está aqui porque `acme.localhost:3000` funciona em navegador
 * moderno sem mexer em `hosts` — e trabalhar em desenvolvimento por um caminho
 * diferente do de produção esconde justamente os defeitos de roteamento por
 * tenant.
 */
const TENANT_DOMAINS: readonly string[] = ['tivexy.com.br', 'tivexy.app', 'localhost'];

/** Tira a porta e normaliza. `Acme.Tivexy.com.br:3000` → `acme.tivexy.com.br`. */
function normalizar(host: string): string {
  const semPorta = host.trim().toLowerCase().split(':')[0] ?? '';
  // IPv6 chega entre colchetes e nunca carrega tenant.
  return semPorta.startsWith('[') ? '' : semPorta;
}

/**
 * O slug do tenant no endereço, ou `null`.
 *
 * Devolve `null` — e não uma exceção — para host desconhecido, IP, apex,
 * subdomínio reservado e endereço de preview. Todos são situações normais, e
 * lançar obrigaria quem chama a envolver em `try` uma leitura de cabeçalho.
 *
 * Um domínio que não é da Tivexy também devolve `null` em vez de tentar
 * adivinhar: `cliente.parceiro.com` pode ser domínio próprio de um tenant um
 * dia, mas isso exigiria consultar o banco, e aí não seria mais uma função
 * pura. Melhor devolver "não sei" do que chutar.
 */
export function tenantSlugFromHost(host: string | null | undefined): string | null {
  if (typeof host !== 'string') return null;

  const limpo = normalizar(host);
  if (limpo.length === 0) return null;

  // Endereço por IP não carrega tenant.
  if (/^\d+(\.\d+){3}$/.test(limpo)) return null;

  const dominio = TENANT_DOMAINS.find((d) => limpo === d || limpo.endsWith(`.${d}`));
  if (dominio === undefined) return null;

  // O apex não é tenant nenhum.
  if (limpo === dominio) return null;

  const prefixo = limpo.slice(0, limpo.length - dominio.length - 1);

  // Só um nível: `a.b.tivexy.com.br` não é o tenant "a.b" nem o tenant "a".
  // Aceitar seria deixar dois endereços diferentes levarem ao mesmo lugar.
  if (prefixo.includes('.')) return null;

  if (isReservedSubdomain(prefixo)) return null;

  return prefixo;
}
