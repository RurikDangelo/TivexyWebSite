import type { Metadata, Viewport } from 'next';
import { Geist_Mono, Inter, Manrope } from 'next/font/google';
import './globals.css';

/* As mesmas três famílias da landing: a plataforma precisa parecer da mesma empresa. */
const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  display: 'swap',
});

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Tivexy',
    template: '%s · Tivexy',
  },
  description: 'Plataforma Tivexy — ERP, CRM e automação multi-tenant.',
  // A aplicação é autenticada: nada aqui deve ser indexado.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a1633' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${manrope.variable} ${inter.variable} ${geistMono.variable} h-full`}
    >
      <head>
        {/*
         * Aplica o tema antes da primeira pintura. Sem isso a página pisca em
         * claro antes de virar escura. Precisa ser síncrono e inline.
         */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('tivexy-theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(t!=='light'&&d))document.documentElement.classList.add('dark')}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
