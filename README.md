# Tivexy — site oficial

Site institucional e comercial da Tivexy: sistemas sob medida, SaaS, automação e inteligência artificial para empresas.

- **Stack:** [Astro 7](https://docs.astro.build) (saída estática), TypeScript estrito, CSS com design tokens. Sem framework de UI no navegador: todo o JavaScript da home tem cerca de 17 KB.
- **Fontes:** Manrope (títulos), Inter (texto) e Geist Mono (rótulos e dados), servidas pelo próprio site com a API de fontes do Astro.
- **Hero:** técnica "Scroll Cinema". A seção fica fixa enquanto a rolagem comanda um único progresso `p` (0 → 1), que monta a jornada *operação espalhada → áreas conectadas → painel Tivexy*. Tudo em HTML/CSS, sem vídeo.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm install` | Instala as dependências |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Gera o site em `dist/` (inclui sitemap, robots.txt e imagem Open Graph) |
| `npm run preview` | Serve o build localmente |
| `npm run check` | Checagem de tipos (Astro + TypeScript) |
| `npm run lint` | ESLint |
| `npm run validate` | Tipos, lint e build de uma vez |
| `npm run icons` | Regera favicon, ícones, `logo.png` e `site.webmanifest` a partir da logo oficial |

## Configuração antes de publicar

Copie `.env.example` para `.env` (ou configure as variáveis na hospedagem):

| Variável | Para quê |
| --- | --- |
| `PUBLIC_SITE_URL` | Domínio final. Usado em canonical, sitemap, Open Graph e JSON-LD |
| `PUBLIC_WHATSAPP_NUMBER` | WhatsApp comercial (ex.: `5511999999999`). Ativa os botões de WhatsApp |
| `PUBLIC_CONTACT_EMAIL` | E-mail comercial exibido no contato e no rodapé |
| `PUBLIC_LEADS_ENDPOINT` | URL que recebe o formulário por `POST` JSON (n8n, Make, Zapier, Formspree, Edge Function etc.) |

O formulário usa o primeiro destino disponível: **endpoint → WhatsApp (mensagem preenchida) → e-mail (mailto)**. Sem nenhum deles, o build mostra um aviso. Em desenvolvimento o envio é simulado, e em produção a pessoa vê uma mensagem de erro.

Campos enviados ao endpoint: `nome`, `empresa`, `email`, `whatsapp`, `segmento`, `tipoSolucao`, `necessidade`, `pagina`, `enviadoEm`.

## Onde editar o conteúdo

| Conteúdo | Arquivo |
| --- | --- |
| Nome, título, descrição, menu | `src/config/site.ts` |
| Problemas | `src/data/problems.ts` |
| Soluções e páginas `/solucoes/*` | `src/data/services.ts` |
| Etapas do processo | `src/data/process.ts` |
| Produtos SaaS | `src/data/products.ts` |
| Tecnologia | `src/data/technology.ts` |
| Sistemas base em "Cases e projetos" (cafeteria, mercado, ERP, CRM) | `src/data/systems.ts` |
| Cases, depoimentos, logos e números | `src/data/proof.ts` |
| Jornada do hero (posições e tempos) | `src/components/sections/hero/timeline.ts` |

### Cases e prova social

Por decisão de marca, **nada é inventado**:

- A seção "Cases e projetos" mostra os sistemas base da Tivexy em abas: sistema para cafeterias, sistema para mercados, ERP essencial e CRM essencial. São apresentados como exemplos do que a Tivexy desenvolve, não como clientes. As telas são ilustrativas e trazem a etiqueta "Tela ilustrativa".
- Cases reais em `proof.ts` aparecem antes dos sistemas. Sem cases, só os sistemas aparecem.
- Sem depoimentos, logos ou números, a seção de prova social não aparece.

Para publicar um case, adicione um item em `cases` (imagem em `src/assets/`, importada no próprio arquivo).

### Telas ilustrativas dos sistemas

- Texto das abas (nome, segmento, descrição, recursos): `src/data/systems.ts`.
- Telas: `src/components/ui/SystemPreview.astro`. Tudo é medido em `em`, que acompanha a largura do quadro; abaixo de 28rem cada tela tem uma versão compacta.
- A aparência das telas fica em `src/components/ui/system-preview.css`, fora do CSS crítico. Esse arquivo só é baixado quando as telas se aproximam da área visível, e o tamanho delas continua no CSS crítico do componente, então nada muda de lugar quando ele chega. Isso mantém o HTML inicial leve (LCP de 2,1 s no mobile).
- O botão "Quero um sistema assim" rola até o contato, marca "Sistema sob medida" e começa a mensagem com o nome do sistema, sem apagar o que a pessoa já escreveu.

## Marca

A logo oficial fica em `src/assets/brand/`. Os vetores foram extraídos do PDF da marca sem redesenho (símbolo das setas com S). Os arquivos não têm cor fixa: a cor vem do CSS.

| Arquivo | Uso |
| --- | --- |
| `tivexy-simbolo.svg` | Símbolo: favicon, ícones, hub do hero, marca d'água do CTA |
| `tivexy-wordmark.svg` | Wordmark "TIVEXY": cabeçalho, rodapé, menu, hero, Open Graph |
| `tivexy-tagline.svg` | Tagline "TECNOLOGIA QUE TRANSFORMA" |
| `tivexy-logo-vertical.svg` | Logo completa (símbolo, wordmark e tagline): `public/logo.png` para buscadores |

Componentes em `src/components/ui/`:

- `Logo.astro`: logo horizontal (símbolo + wordmark).
- `LogoSymbol.astro` e `Wordmark.astro`: as partes isoladas.
- `LogoMark.astro`: símbolo branco sobre azulejo azul (ícone de app).

Símbolo e wordmark são definidos uma vez por página (`BrandSprite.astro`) e reutilizados com `<use>`.

Ao trocar qualquer arquivo da marca, rode `npm run icons` e depois `npm run build`.

## Design system

- Tokens em `src/styles/tokens.css`: cores, tipografia, espaço (grade de 8 px), raios, sombras, bordas, movimento e camadas.
- Breakpoints como `@custom-media` em `src/styles/media.css` (uso: `@media (--lg) { … }`), espelhados em `src/config/breakpoints.ts`.
- **Azul da marca `#1648a6`**, tirado da logo. A escala azul inteira usa a mesma matiz:
  - `blue-600` (marca): superfícies sólidas com texto ou ícone, como botões, logo, azulejos e o painel do CTA final.
  - `blue-500` (sinal): linhas, pontos, progresso e foco.
- Semântica da narrativa: **cinza** representa a operação de hoje (manual, desconectada) e **azul** o que a Tivexy conecta.
- Componentes em `src/components/ui` (botão, ícones, seção, cabeçalho de seção, logo), `layout` (header, rodapé, SEO) e `sections`.

## Qualidade verificada

- Lighthouse (mediana): **mobile 99 / 100 / 100 / 100**, **desktop 100 / 100 / 100 / 100**. LCP 2,1 s no mobile, CLS 0.
- axe-core (WCAG 2.2 AA): 0 violações em todas as páginas, a 375 px e 1440 px.
- Sem overflow horizontal de 320 px a 1920 px. Navegação completa por teclado, inclusive nas abas de sistemas (setas, Home e End). `prefers-reduced-motion` respeitado (o hero troca de quadro só por opacidade, e a altura da seção nunca colapsa).
- Links com âncora vindos de outra página (ex.: `/#contato` no menu de `/solucoes/saas/`) param exatamente na seção.
- Atenção ao peso do HTML da página inicial: comprimido, ele está em torno de 42 KB. Passar de ~43 KB custa uma ida e volta extra de rede na simulação do Lighthouse (LCP vai de 2,1 s para 2,3 s). Conteúdo novo que fique abaixo da primeira dobra pode seguir o mesmo caminho das telas ilustrativas (CSS carregado sob demanda).
