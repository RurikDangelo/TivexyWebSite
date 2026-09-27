import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/*
 * O endereço do cliente, dito como ele é hoje.
 *
 * `{slug}.tivexy.com.br` aparecia em três telas do Admin como se fosse o
 * endereço navegável da empresa. **Não é.** O domínio e o DNS curinga são
 * dependência externa pendente e a produção roda em `tivexy-web.vercel.app`:
 * nenhum navegador abre `acme.tivexy.com.br` hoje, e a string estava fixa no
 * código, sem vir de variável de ambiente nenhuma.
 *
 * O slug continua na tela porque é identificador real — é ele que o
 * provisionamento grava e é por ele que o cliente é reconhecido. O que sai é a
 * afirmação de um endereço que não resolve: onde o endereço planejado aparecer,
 * aparece rotulado, e ao lado de como se entra de fato.
 *
 * Quando o DNS existir, este arquivo é o único ponto a mudar — e o host passa a
 * ser lido de env em vez de constante.
 */

/** O host que o produto vai usar. Ainda não resolve. */
export const HOST_PLANEJADO = 'tivexy.com.br';

/** Por onde se entra hoje, de verdade. */
export const ACESSO_DE_HOJE = 'tivexy-web.vercel.app';

export const COMO_SE_ENTRA_HOJE = `Hoje o acesso é por ${ACESSO_DE_HOJE}, escolhendo a empresa no menu.`;

/** O subdomínio planejado para um slug. Nunca renderize isto sem o selo ao lado. */
export function enderecoPlanejado(slug: string): string {
  return `${slug}.${HOST_PLANEJADO}`;
}

export interface EnderecoPendenteProps {
  slug: string;
  className?: string;
}

/**
 * O endereço planejado com o selo que diz que ele ainda não existe.
 *
 * O selo é `warning`, que já traz o próprio ícone: a advertência não depende de
 * quem distingue cores (R8), e a palavra "PENDENTE" está escrita.
 */
export function EnderecoPendente({ slug, className }: EnderecoPendenteProps) {
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      {/* `line-through` não: o endereço não foi desativado, ele ainda não nasceu. */}
      <span className="font-mono text-caption text-content-subtle">{enderecoPlanejado(slug)}</span>
      <Badge tone="warning" tamanho="xs">
        PENDENTE — DNS
      </Badge>
    </span>
  );
}

export interface AvisoDeEnderecoProps {
  className?: string;
}

/** A frase que acompanha o selo. Uma vez por tela, não uma vez por linha. */
export function AvisoDeEndereco({ className }: AvisoDeEnderecoProps) {
  return (
    <p className={cn('text-caption text-content-subtle', className)}>
      O endereço por subdomínio depende do domínio e do DNS, que são dependência externa ainda
      pendente. {COMO_SE_ENTRA_HOJE}
    </p>
  );
}
