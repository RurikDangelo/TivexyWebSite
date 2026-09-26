import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const button = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors duration-150 ease-[var(--ease-standard)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        brand: 'bg-surface-brand text-content-on-brand hover:bg-[var(--tvx-blue-700)] shadow-xs',
        secondary: 'bg-surface-muted text-content hover:bg-surface-inset',
        outline: 'border border-line-strong bg-surface text-content hover:bg-surface-subtle',
        ghost: 'text-content-default hover:bg-surface-muted',
        danger: 'bg-danger text-white hover:opacity-90 shadow-xs',
        link: 'text-content-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-9.5 px-4 text-sm',
        lg: 'h-11 px-6 text-base',
        icon: 'size-9.5',
      },
    },
    defaultVariants: { variant: 'brand', size: 'md' },
  },
);

export type ButtonProps = ComponentProps<'button'> & VariantProps<typeof button>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(button({ variant, size }), className)} {...props} />;
}

export { button as buttonVariants };
