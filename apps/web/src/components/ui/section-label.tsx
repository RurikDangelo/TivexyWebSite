import type { LucideIcon } from 'lucide-react';
import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Tags permitidas. A lista é curta de propósito: um rótulo de seção em
 * versalete é um `div`, um `dt` ou, quando o bloco abaixo for mesmo uma seção
 * do conteúdo, um heading.
 */
export type SectionLabelComo = 'div' | 'p' | 'span' | 'h2' | 'h3' | 'dt' | 'legend';

export interface SectionLabelProps {
  children: ReactNode;
  /**
   * Padrão `div`, e não um heading: cabeçalho de grupo de menu e rótulo de
   * faixa não são títulos do documento. Promovê-los a `<h2>`/`<h3>` foi
   * exatamente o que quebrou a ordem de headings da sidebar. Um `div` não
   * carrega semântica de título, que é o efeito desejado.
   */
  como?: SectionLabelComo;
  Icone?: LucideIcon;
  id?: string;
  className?: string;
}

/**
 * O rótulo de seção em versalete: 11px, mono, espaçado.
 *
 * Existe porque a mesma combinação (`font-mono` + tamanho literal + `uppercase`
 * + `tracking-wider` + `text-content-subtle`) estava reescrita à mão em mais de
 * uma dezena de telas, com três tamanhos diferentes entre elas. Aqui é o token
 * `--text-eyebrow`, que já traz tamanho, peso, tracking e família.
 *
 * A cor é sobrescrita por `className` quando a faixa tem cor própria — o `cn`
 * resolve o conflito, porque `text-eyebrow` é tamanho e `text-*` de cor é cor.
 */
export function SectionLabel({ children, como = 'div', Icone, id, className }: SectionLabelProps) {
  const Tag: ElementType = como;

  return (
    <Tag
      id={id}
      className={cn(
        'flex items-center gap-1.5 text-eyebrow text-content-subtle uppercase',
        '[&_svg]:size-3.5 [&_svg]:shrink-0',
        className,
      )}
    >
      {Icone !== undefined && <Icone aria-hidden />}
      {children}
    </Tag>
  );
}
