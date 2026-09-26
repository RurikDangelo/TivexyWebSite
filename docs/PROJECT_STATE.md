# PROJECT STATE

> Estado real do ecossistema Tivexy. **Atualize junto com a entrega, não depois.**
>
> Última atualização: **20/09/2026**

## Legenda

| Estado                 | Significa                                   |
| ---------------------- | ------------------------------------------- |
| ✅ **FUNCIONA**        | Verificado por execução, não por leitura    |
| 🟡 **PARCIAL**         | Existe, mas não atende a Definition of Done |
| 🔴 **QUEBRADO**        | Existe e não funciona                       |
| ⬜ **NÃO EXISTE**      | Ainda não foi construído                    |
| 🔒 **EXTERNO**         | Bloqueado por conta, credencial ou terceiro |
| ❓ **PRECISA DECISÃO** | Bloqueado por decisão de produto            |

## 1. O que existe e funciona

| Item                         | Estado | Verificação                                                        |
| ---------------------------- | ------ | ------------------------------------------------------------------ |
| Landing page (`apps/site`)   | ✅     | `npm run validate:site` — 0 erros de tipo, 0 de lint, 7 páginas    |
| Imagem Open Graph            | ✅     | PNG 1200×630 gerado no build                                       |
| Sitemap + robots.txt         | ✅     | Gerados no build                                                   |
| Design system da landing     | ✅     | `apps/site/src/styles/tokens.css`                                  |
| Identidade de marca          | ✅     | 4 SVGs oficiais em `apps/site/src/assets/brand/`                   |
| Monorepo (npm workspaces)    | ✅     | `npm install` + build dos dois apps na nova estrutura              |
| Casca do SaaS (`apps/web`)   | ✅     | `npm run validate:web` — 0 erros; conferido no navegador           |
| Esquema do Core              | ✅     | **Aplicado** em `tivexy-core`; 146 testes em Postgres 18           |
| Knowledge base (`docs/`)     | ✅     | Cofre Obsidian versionado                                          |
| Trello estruturado           | ✅     | Listas, labels por módulo e backlog inicial                        |
| Contratos (`packages/core`)  | ✅     | `npm run validate` — 519 testes; contratos conferidos contra o SQL |
| Autenticação e sessão        | ✅     | Login, proxy e `current_viewer()` exercitados no banco real        |
| Provisionamento pela tela    | ✅     | Cliente criado, retomado e desfeito contra o Postgres do projeto   |
| CI (GitHub Actions)          | 🟡     | Escrito e no remoto; roda na abertura do PR, não em push de branch |
| Formatação e finais de linha | ✅     | `.gitattributes` + Prettier limpo; build idêntico comprovado       |

## 2. Estado por módulo

### Landing — `apps/site`

**Estado:** ✅ FUNCIONA · **Docs:** `apps/site/README.md` · **Trello:** label `SITE`

Deploy na Vercel apontando para `apps/site`, verificado em preview real.

Pendência: conferir se o destino do formulário de contato ainda responde. As
variáveis já estão cadastradas em produção; o aviso do build é local, por falta
de `.env` na máquina.

### Tivexy Core — esquema do banco

**Estado:** 🟡 PARCIAL · **Docs:** [[02-ARCHITECTURE/DATABASE]] · [[12-SECURITY/MULTI_TENANCY]] · **Trello:** `CORE`

15 tabelas em `supabase/migrations/`: tenancy (planos, módulos, tenants),
identidade e RBAC (usuários, papéis, permissões, vínculos, equipes), auditoria e
provisionamento. Mais RLS em todas elas e o catálogo da plataforma
(9 módulos, 51 permissões, 3 papéis de sistema, 3 planos).

**Verificado por execução** — `npm run test:db`, 146 testes contra Postgres 18:

- Isolamento entre tenants nas quatro operações (ler, inserir, atualizar, excluir)
- Nenhuma tabela sem RLS; nenhuma tabela sem política; `search_path` fixo em
  toda função `SECURITY DEFINER`
- Auditoria append-only; convite pendente sem acesso; `has_permission` por papel
- `current_viewer()`: o contexto de acesso da requisição, com teste de vazamento
  em cada corte — estranho não descobre nem que o tenant existe
- Provisionamento ponta a ponta: idempotência, falha no meio, retomada sem
  repetir etapa concluída
- Compensação: desfaz na ordem inversa, preserva o histórico da falha, cancela
  o tenant em vez de apagá-lo, e não deixa execução nova entrar durante o
  desfazer

**Não verificado:** `auth.uid()` real vindo de JWT e comportamento sob
concorrência. Os testes rodam em PGlite (Postgres em WASM) com `auth.uid()`
simulado por configuração de sessão — fiel ao contrato, não ao transporte.

**Aplicado em 20/09/2026.** As dez migrations subiram para `tivexy-core` pelo
CLI. `supabase db push --dry-run` responde `upToDate: true`, e as 15 tabelas
estão lá com todos os índices — inclusive o parcial
`provisioning_runs_one_active_per_tenant`.

### Tivexy Core — camada de aplicação (`packages/core`)

**Estado:** 🟡 PARCIAL · **Docs:** `packages/core/README.md` · **Trello:** `CORE`

Existe e é consumido por `apps/web`. **189 testes.**

**O catálogo e os estados** — módulos, permissões, papéis, planos, e os estados
de tenant, vínculo e provisionamento. Espelham o SQL, e é o teste de contratos
que impede os dois de divergirem.

**As decisões** — regras puras que a aplicação aplica antes de falar com o
banco, cada uma espelhando uma garantia que o banco também tem:

- `decideAccess()`, `matchRule()`, `parseViewer()` — quem pode abrir esta rota.
  37 testes: a ordem em que nega, o padrão fechado, contexto malformado virando
  menos acesso
- `planProvisioning()` — o que acontece ao criar este cliente. A decisão saiu de
  dentro do backend e virou lista ordenada de operações; `previewOf()` a resume
  para mostrar antes de executar
- `tenantSlugFromHost()` — de qual tenant é esta requisição, lido do subdomínio

**A configuração de nicho** — `checkBlueprint()`, `resolveSettings()` e o
catálogo de configurações. Ver a seção Blueprint abaixo.

**18 testes conferem os contratos contra o SQL**, e não só os códigos: `isActive`
contra o índice parcial, `isTerminal` contra a constraint de data de fim, e o
formato do slug contra `tenants_slug_format`.

**Não existe:** serviços de domínio, Feature Flags, Themes e Notifications —
estes três ainda não têm nem tabela.

### Provisionamento — **prioridade zero**

**Estado:** 🟡 PARCIAL · **Docs:** [[06-ADMIN/PROVISIONING]] · **Trello:** `ADMIN`

É o que transforma a plataforma em SaaS de verdade.

**Existe e roda contra Postgres:** `planProvisioning()` decide e
`apps/web/src/server/provisioning/execute.ts` escreve. Os dois são código de
produção — o teste importa os mesmos módulos que o servidor vai importar, sem
uma terceira versão parecida no meio.

Os três caminhos existem e são exercitados contra Postgres:

- **`executeProvisioning`** — a primeira tentativa. Idempotência pela chave,
  uma linha por etapa, e falha no meio deixa o cliente em `provisioning`, que é
  honesto: existe e não opera.
- **`resumeProvisioning`** — continua de onde parou, **sem repetir etapa
  concluída**. Habilitar módulo de novo seria inócuo, mas criar papel de novo
  viola unicidade. Recusa retomar o que não falhou.
- **`compensateProvisioning`** — desfaz na ordem inversa, lendo de
  `provisioning_steps.result` o que **esta** execução criou. O cliente é
  cancelado, não apagado; a etapa vira `compensated`, não some; a auditoria não
  é apagada — o desfazer acrescenta o próprio registro.

A garantia mais delicada, e a que tem o teste mais importante: **a compensação
não apaga a identidade de quem já administrava outro cliente.** Ela perderia o
acesso a um cliente que nada tinha a ver com a falha.

**O gatilho da interface existe, e foi exercitado de ponta a ponta contra o
Postgres do projeto** em 20/09/2026 — criar, falhar no meio, retomar e desfazer,
tudo pela tela.

A prévia do formulário roda `planProvisioning`, a **mesma** função que o
servidor executa. Não é uma descrição paralela do que deveria acontecer: é o
próprio plano, e por isso não tem como divergir dele.

`/admin` mostra os provisionamentos parados no meio com as duas saídas lado a
lado. Nenhuma é a padrão: retomar serve para falha passageira, desfazer para
entrada errada, e o executor não escolhe sozinho.

**A entrada da execução passou a ser guardada** em `provisioning_runs.payload`.
Sem ela não há como retomar: o e-mail de quem administraria não está em tabela
nenhuma enquanto `create_admin` não concluir, que é justamente a etapa que
falha. As **operações** continuam fora de propósito — o plano é recalculado a
cada retomada, com o blueprint de hoje.

#### Dois defeitos que só apareceram contra o banco real

Os 148 testes de banco rodam em PGlite, que normaliza uma diferença que o driver
de produção não normaliza. Foi por ali que estes dois passaram:

**1. JSON gravado como string dentro de `jsonb`.** Uma string destinada a coluna
`jsonb` é _analisada_ pelo PGlite e _serializada de novo_ pelo driver de
produção. `result` virava texto, não objeto. Corrigido com `$n::text::jsonb` em
toda escrita de JSON.

**2. O estrago do primeiro não era um erro, era silêncio.** A leitura não achava
`effects`, a compensação desfazia zero efeitos, marcava cada etapa como
`compensated` e respondia sucesso. Módulos e papéis continuavam no banco com a
tela dizendo que tinham saído. Agora `lerEfeitos` distingue "nada a desfazer" de
"não dá para saber o que foi feito", e o segundo caso **recusa**.

Os dois têm teste de regressão, e a regressão foi conferida quebrando o código
de propósito para ver o teste falhar.

#### A entrega do convite continua pendente 🔒

**Criar a conta não precisa de SMTP; entregar o convite precisa.** O projeto
ainda usa o servidor de e-mail embutido do Supabase, que só escreve para membros
da equipe e para poucas mensagens por hora.

A primeira versão usava `inviteUserByEmail`, que recusa o endereço quando não
consegue enviar — e responde `Email address "…" is invalid`. O provisionamento
inteiro parava em `create_admin` com uma mensagem que falava de e-mail inválido
enquanto o e-mail estava certo e o que faltava era o servidor de envio.

O plano já separava as duas coisas — `create_admin` cria, `send_invite` entrega
—, e o executor passou a respeitar essa separação. A conta é criada sem enviar
nada, e a tela **não diz que mandou e-mail**: diz que não mandou, e oferece o
link de acesso para o Super Admin repassar. Quando houver SMTP próprio, o envio
volta para dentro de `send_invite`.

**A fronteira nomeada:** `IdentityPort`. Identidade não se cria por SQL — em
produção é a Auth Admin API. Fingir que uma escrita em SQL cria uma conta é o
tipo de atalho que passa no teste e falha na primeira pessoa real.

### Aplicação SaaS — `apps/web`

**Estado:** 🟡 PARCIAL — casca pronta · **Docs:** `apps/web/README.md` · **Trello:** `CORE`

Next.js 16 (App Router, Turbopack), React 19, TypeScript estrito, Tailwind v4.

**Pronto e verificado por execução** (`npm run validate:web`: typecheck, lint e
build sem erro; conferido no navegador em claro, escuro e 375px):

- Design system da marca, com camada semântica e tema claro/escuro
- Casca: cabeçalho, navegação lateral, gaveta mobile com `aria-modal`, foco e
  trava de scroll
- Troca de tema em três estados, persistida, sem piscar na primeira pintura
- Primitivos: botão, card, badge, campo
- `/painel` com o estado real da plataforma — **não é dashboard de produto**,
  não há dado de negócio
- Estados de 404, erro e carregamento (esqueleto, não spinner)
- Mapa de regras por rota em `src/config/routes.ts`, **fechado por padrão**, com
  teste que cruza navegação e rotas
- `lib/auth/guard.ts`: a guarda de rota, pura — junta `matchRule`,
  `decideAccess` e `redirectFor`, e resolve as duas coisas que só aparecem
  quando elas se juntam: laço de redirecionamento e redirecionamento aberto
- `lib/env.ts`: leitura de ambiente que falha cedo e nomeia a variável que
  falta, em vez de `fetch failed` no meio da requisição
- `/acesso-negado`: a tradução de `DenialReason` para texto que distingue
  "módulo não contratado" de "sem permissão" — a diferença entre falar com o
  comercial ou com o administrador da empresa

**72 testes em `apps/web`**, incluindo um invariante que percorre cada motivo de
negação com destino e prova que quem foi mandado para lá consegue abrir.

**Não existe ainda:** autenticação, banco, rotas `(auth)` e `(admin)`, e qualquer
módulo de negócio. A navegação declara essas rotas como `pending`/`blocked` e as
renderiza desabilitadas, de propósito — a estrutura aparece sem prometer tela
que não há.

**A guarda está ligada, e o fio inteiro foi percorrido no banco real** — não em
modelo. Em 20/09/2026: entrar com senha, o cookie virar sessão,
`current_viewer()` responder do Postgres do projeto, `/admin` abrir para Super
Admin, e `/painel` sem sessão cair em `/entrar?proxima=%2Fpainel`.

**Três camadas, e nenhuma delas sozinha:**

| Camada            | O que decide                              | Por que não basta                                            |
| ----------------- | ----------------------------------------- | ------------------------------------------------------------ |
| `src/proxy.ts`    | renova o cookie; tira quem não tem sessão | middleware já foi contornável por cabeçalho (CVE-2025-29927) |
| `requireAccess()` | tudo o mais, **dentro** da renderização   | não cobre o que o RLS cobre                                  |
| RLS               | a consulta                                | não sabe redirecionar                                        |

O proxy decide **um** caso — falta de sessão. `lib/auth/edge.ts` tem teste para
o invariante de que ele nunca nega por um motivo que não consultou: agir sobre
a ausência aparente de empresa mandaria um administrador legítimo para o
onboarding.

**O caminho é literal em quem chama**, nunca lido de cabeçalho: `'/admin'` está
escrito no layout. Cabeçalho vem da requisição, e quem pedisse `/admin`
anunciando `/painel` seria avaliado pela regra mais fraca.

**Telas de sessão:** `/entrar`, `/recuperar`, `/definir-senha`,
`/auth/callback`, mais as quatro saídas do limbo — `/onboarding`, `/convite`,
`/preparando` e `/empresas`. Nenhuma existia, e `redirectFor` já apontava para
três delas: ligar a guarda antes teria trocado negação por 404.

**Não dizem quem existe.** Erro de credencial é sempre o mesmo texto, e a
recuperação responde igual tenha o endereço conta ou não. Distinguir entregaria
a lista de e-mails cadastrados a quem tentasse um por um.

**Não existe ainda:** aceitar convite pela tela — exige uma função
`SECURITY DEFINER`, porque o RLS nega essa escrita a quem ainda não é membro,
que é exatamente quem está naquela página. Ela diz isso, em vez de mostrar um
botão que falharia.

### Admin / Super Admin

**Estado:** 🟡 PARCIAL · **Trello:** `ADMIN`

`/admin` lista os clientes da plataforma e `/admin/clientes/novo` cria um. A
lista é lida com a sessão, **passando pelo RLS** — não com a chave de serviço:
a política já libera tudo para `is_super_admin()`, e usar a chave secreta ali
contornaria a verificação em vez de exercitá-la. Se a política quebrar, a tela
fica vazia, que é o sintoma que se quer.

O grupo de administração **não aparece** no menu de quem não é Super Admin.
Ausente, não acinzentado: um item com cadeado conta ao cliente que existe um
painel acima do dele e convida a tentar o endereço.

`requireAccess('/admin')` é chamado de novo **dentro** da Server Action. O
layout guardar a página não basta — Server Action é endpoint, e quem descobrir
o identificador dela pode chamá-la sem nunca abrir a tela.

**O primeiro Super Admin nasce de fora**, por `node scripts/super-admin.mjs`.
`is_super_admin` só pode ser escrito por quem já é Super Admin, e a política não
abre exceção para o primeiro — nem deve.

**Não existe:** editar cliente, suspender, trocar plano, convidar usuário.

### CRM

**Estado:** 🟡 PARCIAL · **Docs:** [[04-CRM/CRM]] · **Trello:** `CRM`

O primeiro módulo de negócio. Oito tabelas — contas, pessoas, leads, funis,
etapas, oportunidades, tipos de atividade e atividades — com RLS, permissão por
tabela e privilégio de coluna em `tenant_id`. **27 testes de esquema.**

**A decisão estrutural é a chave estrangeira composta.** Os três defeitos que a
revisão adversarial do Core encontrou eram todos da mesma família: uma linha
apontando para outra de um tenant diferente. Aqui cada tabela tem
`unique (tenant_id, id)` e cada referência leva o tenant junto — apontar para
outro tenant deixa de ser defeito a testar e passa a ser impossível de escrever.
Há teste provando que a recusa vale **fora do RLS**, que é o caminho do
provisionamento.

**A oportunidade não guarda situação própria.** Ela é a da etapa. Guardar as
duas seria manter duas verdades que divergem no dia em que alguém mover a etapa
por SQL — sem erro, só relatório errado.

**Tela pronta: `/crm/leads`.** Cadastro, transições de estado, validação por
campo, estado vazio e 375px conferidos no navegador, contra o banco real.

**O vocabulário do nicho chegou na tela.** Uma clínica lê "interessados" onde
uma consultoria lê "leads" — verificado provisionando a clínica odontológica e
abrindo a listagem. Ver abaixo.

**A conversão de lead existe** e roda numa transação só, em
`crm_convert_lead()`. São quatro escritas que só fazem sentido juntas, e o
cliente PostgREST não tem transação — daqui seriam quatro chamadas, com quatro
pontos onde a rede pode cair. `SECURITY INVOKER`: cada escrita passa pelo RLS,
e trocar por `DEFINER` quebra dois testes.

Verificada contra o banco real: um lead virou conta, pessoa e oportunidade de
R$ 4.500,00 na etapa "Orçamento enviado" do funil "Tratamentos", com o lead
carimbado apontando para os três.

**Não existe:** contatos, contas, funil, atividades, busca e importação.

### ERP

**Estado:** ⬜ NÃO EXISTE · **Trello:** `ERP` · **Depende de:** Core, Auth, RBAC, provisionamento

### Blueprint — configuração de nicho

**Estado:** 🟡 PARCIAL · **Docs:** `packages/core/blueprints/README.md` · [[16-DECISIONS/ADR-003-blueprint-como-configuracao]] · **Trello:** `BLUEPRINT`

O [[16-DECISIONS/ADR-003-blueprint-como-configuracao|ADR-003]] separou dois
Blueprints que estavam com o mesmo nome. Este é o primeiro: **configuração
declarativa de provisionamento**.

**Pronto e verificado por execução:**

- `packages/core/src/blueprint.ts` — o contrato e `checkBlueprint`, que relata
  todos os problemas de uma vez com o caminho dentro do documento
- Três nichos reais em JSON: `cafeteria` e `mercado` (erp, inventory, finance)
  e `clinica-odontologica` (crm, finance). Os dois primeiros habilitam os
  **mesmos módulos** e ainda assim são nichos diferentes — mudam papéis,
  categorias e vocabulário. Se o módulo bastasse para distinguir, o plano já
  resolveria.
- `settings.ts`: o catálogo de configurações com tipo, padrão e descrição.
  `resolveSettings()` devolve o efetivo — padrão mais o que o nicho mudou, só
  dos módulos habilitados
- Rótulo, configuração e semente são **validados contra o Core**. Chave errada
  não dava erro, só não tinha efeito: o defeito sem sintoma
- 10 testes de provisionamento contra Postgres cobrem o marco do ADR-003:
  nichos diferentes produzem tenants diferentes, e o mesmo nicho provisionado
  duas vezes produz tenants iguais

**Não existe:** o motor de esquema em tempo de execução — entidades e
formulários definidos por dado. Continua adiado pelo ADR-002, e com razão.

**As sementes de CRM viram linha de verdade** desde 20/09/2026. As de ERP
continuam registradas como pendentes, porque as tabelas do ERP não existem — e
a diferença entre as duas é o que prova que "pendente" não é preguiça.

As etapas citam o funil **pelo nome**, então o funil precisa vir antes na lista.
`checkBlueprint()` recusa o documento em que não vem: sem isso, trocar duas
linhas de lugar no JSON passa na validação e quebra no meio de um
provisionamento real, com o cliente já criado.

**O vocabulário passou a ser gravado.** O Blueprint sempre pôde traduzir
rótulos e `checkBlueprint()` sempre validou cada chave — mas nada gravava, e o
tenant nascia com módulos, papéis e sementes do nicho e sem o vocabulário. A
promessa do produto ficava dois terços verdadeira, e a parte que faltava não
dava erro: a interface só mostrava o nome genérico. Hoje vai para
`tenants.terms` junto do tenant.

### AI Engine

**Estado:** ⬜ NÃO EXISTE · 🔒 credenciais OpenAI · **Trello:** `AI`

### Automation Engine

**Estado:** ⬜ NÃO EXISTE · **Trello:** `AUTOMATION`

### Integrações — WhatsApp / Meta

**Estado:** ⬜ NÃO EXISTE · 🔒 Meta Business + WhatsApp Business API · **Trello:** `META`

Adapter pode ser construído com mock **rotulado** antes das credenciais. A conexão
real, não.

### Fiscal

**Estado:** ⬜ NÃO EXISTE · 🔒 provedor fiscal + certificado digital · **Trello:** `FISCAL`

⚠️ Nunca apresentar emissão simulada como nota fiscal real.

### Financeiro / Estoque

**Estado:** ⬜ NÃO EXISTE · **Trello:** `FINANCE` · **Depende de:** ERP

## 3. O que está quebrado

### O menu não fala o vocabulário do nicho — visto em 24/09/2026

**Estado:** 🟡 · **Onde:** `apps/web/src/config/navigation.ts`

A página de leads diz "Interessados" para a clínica, e o **menu lateral**
continua dizendo "Leads". O vocabulário do Blueprint chega na tela e não
chega na navegação, que é a superfície mais visível do sistema.

Para quem usa, lê como inconsistência. Para o produto, é a promessa central
vazando pelo menu — o mesmo defeito que `tenants.terms` foi criado para
fechar, uma camada acima.

`navigation.ts` é configuração estática e precisa passar a ser resolvida com
os termos do tenant, como a página já faz em `lib/crm/terms.ts`.

Apareceu ao abrir o sistema para olhar, não em teste. Nenhum teste compara o
rótulo do menu com o da página.

Corrigido em 18–19/09/2026:

- `sharp` usado sem ser declarado no `package.json` — funcionava por acidente
- `og.png.ts` montava caminho de fonte à mão, incompatível com o içamento do monorepo

**Corrigido em revisão adversarial do próprio esquema**, depois de a primeira
rodada de testes ter passado. Todas introduzidas nas migrations desta noite:

| #   | Falha                                                                                                                                       | Gravidade  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | **Escalada de privilégio:** qualquer pessoa autenticada podia escrever `is_super_admin = true` na própria linha e enxergar todos os tenants | 🔴 Crítica |
| 2   | Vínculo podia apontar para papel de **outro** tenant, aplicando as permissões dele no tenant errado                                         | 🟠 Alta    |
| 3   | Equipe podia receber membro de **outro** tenant                                                                                             | 🟠 Alta    |
| 4   | `userId: ''` contava como autenticado                                                                                                       | 🟡 Média   |
| 5   | `/ADMIN` caía no padrão `member` em vez de `superAdmin`                                                                                     | 🟡 Média   |

A causa comum das três primeiras: **RLS decide quais linhas alguém enxerga, não
quais colunas foram escritas nem se os valores da linha fazem sentido juntos.**
Documentado em [[12-SECURITY/MULTI_TENANCY#O que o RLS **não** cobre]].

Um defeito no harness contribuía: os `GRANT`s eram aplicados **depois** das
migrations, o que desfaria qualquer revogação de privilégio feita em migration —
o teste de escalada teria passado por engano.

## 4. O que está em desenvolvimento

Nada em andamento.

Em 20/09/2026 a autenticação deixou de ser pendência: sessão, proxy, telas de
entrada e provisionamento pela tela foram construídos e exercitados contra o
projeto `tivexy-core`. O que a verificação criou — dois tenants e três contas —
foi removido depois, e o banco voltou a zero.

**A decisão foi tomada: CRM primeiro.** O esquema, os contratos e a primeira
tela (`/crm/leads`) estão de pé e verificados contra o banco real.

A conversão de lead entrou. O próximo passo dentro do CRM são as **telas de
funil, contatos e contas** — hoje a conversão cria as três coisas e só a de
leads tem onde ser vista.

## 4.1 Como olhar o sistema hoje

Ele roda nesta máquina, em `http://localhost:4390`. O passo a passo está em
[[15-OPERATIONS/RODAR-LOCAL]] — inclui o `.env`, o primeiro Super Admin (que
nasce de fora, porque ninguém pode se promover sozinho) e o
`scripts/demo.mjs`, que monta um cliente provisionado pelo Blueprint da
clínica para haver o que olhar.

O demo não inventa faturamento nem preenche gráfico. Nomes carregam "Demo" e
e-mails usam `.invalid`, que nunca resolve.

### A conta desta máquina é a pessoal

Aconteceu em 24/09/2026: o Super Admin foi criado com o e-mail **corporativo**
e teve de ser removido do projeto. A regra já existia e não foi aplicada.

Esta máquina trabalha os projetos **não corporativos**; o notebook é o da NIT.
Quais endereços atendem quais serviços fica **fora deste repositório**, de
propósito — ele é público, e mapear serviço → e-mail de login entrega metade
do trabalho a quem estiver tentando entrar.

## 5. Decisões tomadas

| #       | Decisão                                                                  | Data       |
| ------- | ------------------------------------------------------------------------ | ---------- |
| ADR-001 | Monorepo no repositório existente, não em `TivexyCortex/`                | 18/09/2026 |
| ADR-002 | Ordem de construção: Core e provisionamento antes de módulos e Blueprint | 18/09/2026 |
| —       | Cofre Obsidian versionado em `docs/`                                     | 18/09/2026 |
| —       | SaaS em Next.js, conforme Master Plan §4 — não em Astro                  | 18/09/2026 |

## 6. Dependências externas — 🔒 BLOCKED — EXTERNAL

Ordenadas por urgência:

| #   | Tarefa                                          | Bloqueia                 | Urgência    |
| --- | ----------------------------------------------- | ------------------------ | ----------- |
| 1   | **Abrir o PR** da branch `monorepo-tivexy-core` | Primeira execução do CI  | 🔴 Imediata |
| 2   | **SMTP próprio no Supabase**                    | Convite e recuperação    | 🔴 Imediata |
| 3   | Conferir o destino do formulário de contato     | Leads da landing         | 🟠 Alta     |
| 4   | **Trocar a conta do conector Vercel**           | Qualquer coisa na Vercel | 🟠 Alta     |
| 5   | Projeto Vercel do `apps/web` + variáveis        | Deploy do SaaS           | 🔴 Agora    |
| 6   | Domínio `tivexy.com.br` + DNS                   | SEO, e-mail              | 🟠 Média    |
| 7   | E-mail corporativo + SPF/DKIM/DMARC             | Convites do SaaS         | 🟠 Média    |
| 8   | Credenciais OpenAI                              | AI Engine                | 🟡 Depois   |
| 9   | Meta Business + WhatsApp Business API           | Atendimento              | 🟡 Depois   |
| 10  | Provedor fiscal + certificado digital           | Fiscal                   | 🟡 Depois   |
| 11  | CNPJ, contador, conta PJ, contratos             | Venda formal             | 🟡 Paralelo |

### O SMTP é o que separa "conta criada" de "cliente atendido"

O provisionamento **cria** a conta do administrador sem depender de e-mail —
isso funciona hoje. O que não funciona é **entregar** o convite: o servidor
embutido do Supabase só escreve para membros da equipe da organização, com
limite de poucas mensagens por hora.

Enquanto isso, a tela de sucesso diz que nenhum e-mail foi enviado e gera um
link de acesso para o Super Admin repassar pelo canal que já usa com o cliente.
É funcional e é honesto — mas não escala para venda.

Resolver é cadastrar um provedor em Project Settings → Authentication → SMTP.
Depende do domínio `tivexy.com.br` e do e-mail corporativo, ambos nesta mesma
tabela.

O passo a passo do deploy está em [[15-OPERATIONS/DEPLOY]] — inclui as quatro
variáveis que o `apps/web` lê, a opção de monorepo que o build exige, e o
passo que todo mundo esquece: ensinar o Supabase sobre o endereço novo, sem
o que o login quebra em produção.

A ordem importa: o Supabase é o que **produz as chaves** que a variável de
ambiente da Vercel vai precisar. Cadastrar env antes é preencher campo com valor
que ainda não existe.

O projeto Vercel do `apps/web` era "depois" porque sem autenticação o SaaS não
teria o que servir. **Isso mudou em 20/09/2026**: há o que servir. O que falta
para publicar é a conta certa no conector, logo acima nesta lista, e cadastrar
as mesmas variáveis que `apps/web/.env.local` já tem — inclusive `DATABASE_URL`,
que o provisionamento usa.

### Os dois conectores estão logados na conta errada — reconferido em 20/09/2026

**Diagnóstico corrigido.** A primeira leitura foi "o conector precisa ser
reautorizado no projeto". Está errado: o problema não é escopo, é **conta**.
Esta máquina é a das contas pessoais, e os dois conectores desta sessão estão
autenticados na conta **corporativa**, que é a do notebook. Nenhum projeto
Tivexy vive lá.

Isso muda a ação, e para melhor: é sair e entrar com a conta certa, não
reconfigurar permissão. E não se resolve daqui — `reconnect` só serve para
conector com falha, e os dois estão saudáveis.

> Quais contas hospedam o quê está registrado fora do repositório, de
> propósito: este repositório é **público**, e mapear serviço → e-mail de login
> é entregar ao atacante metade do trabalho. Identificador de projeto (`ref`,
> `team_…`) é público por desenho e pode ficar aqui.

| Conector | Alcança                                           | Precisa alcançar                                  |
| -------- | ------------------------------------------------- | ------------------------------------------------- |
| Supabase | `NIT-GLASSES`, `NIT-ERP-CRM`                      | `tivexy-core` (`lddpqizqjvtimxmorxux`)            |
| Vercel   | `team_VerzWfKr9mCSD0jxIT4siHqz` — projetos da NIT | escopo `tivexy` (`team_StfA3dMbSHoj6qr0sLbMGLK4`) |

Reconferido em 20/09/2026, sem mudança: o conector Vercel lista apenas
`nit-crm-whitelabel-admin`, `vidros` e `barbearia-salao`, todos em
`team_VerzWfKr9mCSD0jxIT4siHqz`. Nenhum projeto Tivexy aparece, e pedir o
escopo `tivexy` responde 403.

A Vercel responde literalmente:

> Trying to access resource under scope "tivexy". You must re-authenticate to
> this scope or use a token with access to this scope.

**Achado positivo:** o escopo `tivexy` **já existe** na Vercel, e a landing vive
nele (`prj_d10OZnrXAeUDSHIgDTEDJMvQ7RKA` — lido de `.vercel/project.json`). A
auditoria listava "criar organização Vercel própria da Tivexy" como pendência;
essa parte está feita. O que falta é o projeto do `apps/web`, que ainda não
existe.

**Resolvido em 19/09/2026 (madrugada):** o `git push` aconteceu — a branch
`monorepo-tivexy-core` está no remoto, no mesmo commit do local. Deixou de
existir trabalho que só vive nesta máquina.

**Resolvido em 19/09/2026:** o projeto Supabase existe — `tivexy-core`, ref
`lddpqizqjvtimxmorxux`, `sa-east-1`. O que restou é menor e está no topo desta
tabela: o conector responde `You do not have permission` nele, porque está
logado na conta errada. Enquanto isso, as migrations entram pelo CLI — que já
está configurado (`npm run db:link && npm run db:push`).

**Resolvido em 19/09/2026:** Root Directory da landing na Vercel → `apps/site`,
verificado por deploy de preview real (build READY, home servida corretamente).

**Correção da auditoria:** `PUBLIC_SITE_URL`, `PUBLIC_WHATSAPP_NUMBER`,
`PUBLIC_CONTACT_EMAIL` e `PUBLIC_LEADS_ENDPOINT` **já estão cadastradas** em
produção e preview na Vercel. A auditoria as deu como ausentes porque o aviso do
build era local — falta o `.env` na máquina, não a variável no ambiente. O que
resta é conferir se o destino do formulário ainda responde.

**Observado, não alterado:** o projeto tem variáveis que parecem sobra de outro
app (`DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`,
`STORE_TIMEZONE`, `SESSION_TTL_DAYS`). A landing em Astro não usa nenhuma.
Apagar segredo sem contexto é irreversível — vale revisar.

## 6.1 O Trello não foi atualizado em 20/09/2026

O conector do Trello caiu no meio da sessão e as ferramentas dele deixaram de
existir. As entregas desta data estão em `docs/` e no código; **o quadro não**.

Enquanto não for reconciliado, quatro fontes de verdade viraram três — que é
exatamente o risco nº 5 desta página acontecendo. O que precisa entrar:

| Card                                | Para                                          |
| ----------------------------------- | --------------------------------------------- |
| Autenticação e sessão               | Concluído                                     |
| Middleware / guarda ligada          | Concluído — virou `proxy.ts`                  |
| Provisionamento no backend          | Concluído                                     |
| Painel Super Admin                  | Concluído em parte — criar, retomar, desfazer |
| **Novo:** SMTP próprio no Supabase  | Bloqueado — externo, 🔴                       |
| **Novo:** aceitar convite pela tela | A fazer — precisa de função SECURITY DEFINER  |
| **Novo:** escolher CRM ou ERP       | Precisa de decisão                            |

## 6.2 O que for construído em sessão de nuvem não é verificado contra o banco

> Registrado em 23/09/2026, antes de mover o trabalho para a nuvem.

`.env` e `apps/web/.env.local` são gitignored, e precisam ser. A sessão de
nuvem recebe **o repositório, não os segredos** — então ela pode construir e
rodar a suíte inteira (o PGlite não precisa de credencial), e **não** pode:

- aplicar migrations em `tivexy-core`
- entrar no sistema e conferir uma tela no navegador
- exercitar RPC e RLS contra o Postgres do projeto

### Por que isso é registrado em vez de só aceito

A legenda desta página separa **✅ FUNCIONA** — "verificado por execução" — de
🟡 PARCIAL. Sem banco, a nuvem só alcança "passa nos testes", que é outra
coisa.

E não é preciosismo. Os dois defeitos mais sérios encontrados em 20/09 **não
foram pegos por teste nenhum**:

| Defeito                                   | Por que o teste não pegou                         |
| ----------------------------------------- | ------------------------------------------------- |
| JSON gravado como texto dentro de `jsonb` | O PGlite normaliza a diferença entre drivers      |
| Funil da clínica sem etapa de saída       | Erro de dado: o esquema aceitava, e nada quebrava |

### A regra, então

Tudo que sair de sessão sem banco entra aqui como 🟡, com a frase **"testado,
não verificado contra o banco real"**. Vira ✅ quando alguém rodar o fluxo
nesta máquina — ou em qualquer uma com o `.env`.

Marcar como ✅ o que só passou em teste é fazer esta página mentir, que é o
risco nº 5 da seção seguinte.

## 7. Riscos ativos

| #   | Risco                                          | Impacto                      |
| --- | ---------------------------------------------- | ---------------------------- |
| 1   | Construir ERP/CRM antes de um Core confiável   | 🔴 Alto                      |
| 2   | Blueprint Engine virar abstração prematura     | 🔴 Alto                      |
| 3   | Duplicar auth/permissões dentro dos módulos    | 🟠 Alto                      |
| 4   | Mock apresentado como funcionalidade real      | 🔴 Crítico (legal/comercial) |
| 5   | Código, docs, Trello e este arquivo divergirem | 🟡 Médio                     |

**Saiu da lista em 19/09/2026:** "trabalho existir só nesta máquina" — o push
aconteceu.

Detalhe em [[PROJECT_AUDIT#17. Riscos]].

## 8. Retomada — nesta ordem

Os dois primeiros são seus e bloqueiam o resto.

### 1. 🔴 Revogar o token da Vercel

Ele foi colado em texto puro no chat da sessão de 18–19/09. Vercel → Settings →
Tokens → revogar e gerar outro. Foi usado para corrigir o Root Directory e
publicar um preview; nada além disso.

Na mesma passada, vale revogar o _deployment protection bypass token_ que a CLI
gerou sozinha para conseguir ler o preview protegido.

### ✅ As migrations foram aplicadas — 20/09/2026

Subiram pelo CLI, com a URL de conexão do `.env`. `supabase db push --dry-run`
responde `upToDate: true`, e as 15 tabelas estão lá com todos os índices.

> **A armadilha que custou quatro tentativas.** O painel do Supabase entrega a
> string de conexão com `[YOUR-PASSWORD]` no lugar da senha. Substituir só o
> miolo deixa o `]` de fechamento grudado no fim, e o servidor responde
> `password authentication failed` — que parece senha errada e não é. Se
> reaparecer, é isso.
>
> A senha também contém caracteres reservados em URL, então ela precisa ser
> percent-encoded. `scripts/` não tem isso; foi feito à mão nesta sessão.

**O que ainda não foi exercido contra o projeto real:** o teste de isolamento
entre tenants. Os 146 testes de banco rodam em Postgres WASM com `auth.uid()`
simulado — fiéis ao contrato, não ao transporte. Rodá-los contra o Supabase
exige um cliente Postgres remoto no harness, que não existe.

### 3. 🔴 Abrir o PR

O push aconteceu, mas **o CI nunca rodou** — e isso está certo: o workflow
dispara em `push` para `main`, em `pull_request` e manualmente. Push de branch
de trabalho não dispara nada, de propósito.

Abrir o PR é o que faz todos os commits serem validados em máquina limpa, não
só nesta. O `gh` aqui não está autenticado, então é pela interface do GitHub —
ou `gh auth login` para destravar e eu abrir.

### ✅ Autenticação, middleware, provisionamento e painel — 20/09/2026

Os itens 4 a 7 do ADR-002 foram construídos e exercitados contra o banco real.
Ver as seções de `apps/web`, Provisionamento e Admin acima.

Para usar, uma vez:

```bash
node scripts/super-admin.mjs seu@email.com "Seu Nome"
```

Ele imprime um link de acesso. Depois de entrar, defina a senha em
`/definir-senha` e `/admin` abre.

### Agora: escolher o primeiro módulo de negócio

CRM ou ERP. É decisão de produto, não de código — e é a única coisa entre o
estado de hoje e um sistema que um cliente usa para trabalhar. O Core, o
provisionamento e o Blueprint já sustentam os dois.

### O que dá para fazer sem esperar nada

- Telas de funil, contatos e contas — a conversão já cria as três coisas
- Aceitar convite pela tela (falta a função `SECURITY DEFINER` que confere o
  convite — o RLS nega essa escrita a quem ainda não é membro)
- Conferir se o destino do formulário de contato da landing ainda responde
- Revisar as variáveis de outro projeto no ambiente Vercel (`DATABASE_URL`,
  `AUTH_SECRET`, `STORE_TIMEZONE` e outras) — a landing não usa nenhuma, mas
  apagar segredo sem contexto é irreversível
- Abrir `docs/` no Obsidian como cofre
