# Integrações — o que existe, o que falta, e de quem

🟡 tela testada, não verificada contra o banco real (25/09/2026).

**Nenhuma integração está conectada.** Cada uma depende de conta, credencial ou
aprovação de terceiros — e do adaptador que a Tivexy ainda vai construir. A
tela `/integracoes` diz isso, uma por uma, e **não simula conexão**: não há
botão "Conectar", não há chave de teste, não há "modo demonstração". Integração
que finge estar ligada é o pior dos dois mundos — o cliente acredita que a nota
saiu, e ela não saiu.

## Por que um catálogo no código, e não uma tabela

Não existe conexão possível ainda, então não há o que gravar. Uma tabela
`integration_connections` hoje só guardaria "não configurado" sete vezes por
empresa. Ela nasce com o primeiro adaptador, junto do que ele precisa guardar
(credencial cifrada, estado, último erro).

O catálogo fica em `apps/web/src/lib/integrations/catalog.ts` e é a fonte da
tela e do tutorial. O que dá para conferir no banco, confere: **CNPJ e razão
social cadastrados** aparecem como prontos ou não na emissão fiscal e no banco,
lidos de `tenants`.

## A lista

Cada integração separa o que é **externo** — depende da empresa ou de um
terceiro, 🔒 BLOCKED — EXTERNAL — do que é **interno**, trabalho da Tivexy.

| Integração              | Da empresa (🔒 externo)                                             | Da Tivexy (interno)                                        |
| ----------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| WhatsApp Business       | Meta Business verificado; número dedicado; modelos aprovados        | App Meta aprovado; adaptador; endereço público com HTTPS   |
| Instagram e Facebook    | Página e conta profissional ligadas ao Meta Business; autorização   | App Meta com permissões; adaptador; endereço público       |
| E-mail                  | — (é da plataforma)                                                 | Provedor SMTP; domínio com SPF, DKIM e DMARC               |
| Emissão fiscal          | Certificado A1; inscrição estadual ou municipal; CSC; dados fiscais | Provedor fiscal contratado; adaptador; NCM/CFOP no produto |
| Banco — Pix e boleto    | Conta PJ com API; credenciais e certificado do banco; chave Pix     | Adaptador do banco; confirmação em endereço público        |
| Maquininha e pagamento  | Contrato com adquirente ou gateway com API                          | Adaptador; homologação com o adquirente                    |
| Inteligência artificial | — (contratar o módulo)                                              | Chave da API da OpenAI; o AI Engine                        |

"Endereço público com HTTPS" é o SaaS publicado num domínio — ver
[[PROJECT_STATE#6. Dependências externas — 🔒 BLOCKED — EXTERNAL]]: projeto
Vercel do `apps/web` e o domínio `tivexy.com.br`.

## O que funciona hoje sem elas

Dita na tela em cada cartão, para ninguém achar que o sistema está parado:

- O telefone fica no cadastro; o atendimento acontece fora do Tivexy.
- O lead de anúncio se cadastra à mão, com a origem.
- O convite gera um link de acesso que o administrador repassa.
- A venda gera comprovante **interno**, que diz não ser documento fiscal.
- A baixa de recebimento é manual, no financeiro.
- A forma de pagamento se registra no balcão; a cobrança acontece na
  maquininha, fora do Tivexy.

## Tela: `/integracoes`

🟡 testado, não verificado contra o banco real (25/09/2026). As onze exigências:
UI (os cartões) · backend (a página lê `tenants` e `modules`) · banco (CNPJ,
razão social e módulos, reais; conexão não há o que ler) · autorização
(`integrations.connections.read`, e o módulo) · validação (não há entrada —
não há o que conectar) · erro (falha de leitura avisa e a lista aparece sem a
conferência) · carregando (o esqueleto do grupo) · vazio (é o estado da tela:
"0 de 7 em uso", com o porquê) · 375 px (conferido) · teste (o catálogo não
tem como dizer "conectado"; a conferência de CNPJ) · documentação (este
arquivo).

- Pede `integrations.connections.read`. Não há escrita — não há o que conectar.
- Uma linha de resumo — "0 de 7 em uso" — contada do estado do catálogo, não escrita.
- Um cartão por integração: para quê, "hoje, sem isso", o que falta da empresa
  (com cadeado e "externo"), o que falta da Tivexy, e o módulo de que depende,
  contratado ou não.
- Selo "Não configurado" em todas. O tipo do catálogo não tem outro estado:
  para dizer "conectado", alguém vai ter que criar o estado — e a conexão.

## A ordem sugerida

1. **E-mail** — é o que separa "conta criada" de "cliente atendido".
2. **Emissão fiscal** — é o que o varejo pergunta primeiro.
3. **WhatsApp** — é o que o serviço pergunta primeiro.
4. Banco, maquininha, Meta, IA — conforme o nicho que vender primeiro.
