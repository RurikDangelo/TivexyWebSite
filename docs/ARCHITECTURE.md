# Arquitetura do ecossistema Tivexy

> Como as peças se encaixam e, principalmente, o que **não** pode depender de quê.
> Layout físico dos diretórios em [[REPOSITORY_STRUCTURE]].

## 1. Visão em uma tela

```
                    ┌──────────────────────┐
                    │   apps/site          │   Landing pública
                    │   (Astro, estático)  │   Sem auth, sem tenant
                    └──────────┬───────────┘
                               │ só um link
                               ▼
                    ┌──────────────────────┐
                    │   apps/web           │   SaaS autenticado
                    │   (Next.js)          │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │    TIVEXY CORE       │
                    └──────────┬───────────┘
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
            ERP              CRM             ADMIN
              │                │                │
              └────────────────┼────────────────┘
                               ▼
                    ┌──────────────────────┐
                    │  Supabase/Postgres   │   RLS por tenant
                    └──────────────────────┘
```

A landing e o SaaS se tocam em **um ponto só**: um link. Nada mais.

## 2. Camadas

| Camada       | Responsabilidade                                               | Não pode                                   |
| ------------ | -------------------------------------------------------------- | ------------------------------------------ |
| **SITE**     | Produto público, SEO, captação de leads                        | Conhecer tenant, auth ou regra de negócio  |
| **WEB**      | Casca da aplicação, rotas, layout, sessão                      | Conter regra de domínio                    |
| **CORE**     | Identidade, tenants, RBAC, planos, módulos, auditoria, engines | Conhecer ERP ou CRM                        |
| **MÓDULOS**  | ERP, CRM, Admin                                                | Duplicar o que é do Core                   |
| **ADAPTERS** | WhatsApp, fiscal, banking, IA                                  | Vazar o formato do provedor para o domínio |
| **DADOS**    | Postgres com RLS                                               | Confiar em filtro feito no frontend        |

## 3. Tivexy Core

O Core é a fundação comum. Uma regra que pertence ao Core **fica no Core** —
não é reimplementada dentro do ERP nem do CRM.

```
TIVEXY CORE
├── Identity          Quem é a pessoa
├── Auth              Login, convite, recuperação, sessão, MFA
├── Tenants           A empresa cliente; unidade de isolamento
├── Users             Vínculo pessoa ↔ tenant
├── Roles             Super Admin, Tenant Admin, Gestor, Colaborador
├── Permissions       Verificadas no servidor, sempre
├── Plans             O que o tenant contratou
├── Modules           O que está habilitado para o tenant
├── Feature Flags     Liga/desliga sem deploy
├── Themes            Aparência por tenant
├── Notifications     Canal único de aviso
├── Audit             Quem fez o quê, quando
├── Integrations      Registro de conexões por tenant
├── Blueprint Engine  Configuração de negócio por nicho
├── AI Engine         Camada de inteligência, com ferramentas controladas
└── Automation Engine TRIGGER → CONDITIONS → ACTIONS
```

### Regra de ouro do multi-tenancy

Toda entidade de negócio carrega `tenant_id`. O isolamento é garantido no **banco**
(RLS), não na aplicação, e nunca por filtro no frontend.

Exceção única: o Super Admin da Tivexy, que não pertence a nenhum tenant.

Teste obrigatório, não negociável:

> Usuário do Tenant B tenta acessar recurso do Tenant A → **acesso negado**.

## 4. Provisionamento — prioridade zero

É o fluxo que transforma a plataforma em operação SaaS de verdade. Vem **antes**
de qualquer módulo de negócio.

```
Super Admin autentica
   → cria tenant
   → dados da empresa
   → escolhe plano
   → habilita módulos
   → cria administrador do tenant
   → provisiona recursos e configurações padrão
   → registra auditoria
   → envia convite
   → administrador acessa
   → onboarding
   → tenant operacional
```

Requisitos que fazem parte da definição, não são extras:

- **Idempotente** — rodar duas vezes não cria dois tenants
- **Retry seguro** em caso de falha parcial
- **Estado de provisionamento visível** no painel
- **Rollback / compensação** quando aplicável
- **Teste E2E** do fluxo inteiro

## 5. Módulos

Cada módulo declara: objetivo, entidades, telas, permissões, workflows, integrações,
automações, eventos, documentação, testes e estado de implementação.

### ERP

Genérico por construção. Não existe "ERP de cafeteria" em código — existe o ERP
com módulos habilitados por Blueprint.

Finance · Inventory · Sales · Purchases · POS · Fiscal · Reports

### CRM

Leads · Contacts · Companies · Deals · Pipelines · Activities · Tasks · OS ·
Support · Conversations

### Admin

Área privilegiada de `apps/web`, não sistema separado. Acesso decidido por
role + permission + tenant scope + super admin scope.

Tenants · Plans · Modules · Blueprints · Users · Domains · Integrations · Audit

## 6. Blueprint Engine

O diferencial do produto. Um Blueprint é a **configuração de um negócio**, não
um fork do código.

Pode definir: módulos, submódulos, entidades, campos, nomenclaturas, permissões,
perfis, workflows, pipelines, etapas, dashboards, indicadores, automações,
templates, formulários, regras, notificações, layouts e menus.

```
Blueprint "Assistência Técnica"
   Clientes → Equipamentos → OS → Diagnóstico → Peças →
   Orçamento → Aprovação → Manutenção → Pagamento → Entrega

Blueprint "Cafeteria"
   Produtos → Ingredientes → Ficha técnica → Estoque →
   Compras → PDV → Pedidos → Delivery → Financeiro → Clientes
```

Mesmo código. Configuração diferente.

Um Blueprint precisa ser **validável, auditável, reproduzível e versionável**.

> **Ordem importa:** o Blueprint Engine só é construído depois de Core +
> provisionamento + um módulo real funcionando. Abstrair nicho antes de ter um
> caso concreto é o caminho mais curto para uma abstração errada.
> Ver [[16-DECISIONS/ADR-002-ordem-de-construcao]].

## 7. AI Engine

Camada própria, com acesso **controlado por ferramentas** — nunca acesso irrestrito
ao banco ou à configuração.

No caso mais sensível, geração de Blueprint:

```
Usuário descreve o negócio
   → IA analisa
   → IA gera Blueprint estruturado
   → Validator
   → Preview
   → Aprovação humana
   → Provisionamento determinístico
   → Tenant configurado
```

A IA **propõe**. O provisionamento que executa é determinístico e auditável.

## 8. Automation Engine

```
TRIGGER  →  CONDITIONS  →  ACTIONS
```

Gatilhos: novo lead, mudança de etapa, venda criada, estoque baixo, pagamento
vencido, mensagem recebida.

Ações: criar tarefa, alterar status, enviar WhatsApp, enviar e-mail, registrar
atividade, disparar webhook.

Com execução registrada, logs, retries, idempotência, tratamento de erro e
ativação/desativação por tenant.

## 9. Integrações — sempre por adapter

O modelo interno é **independente do provedor**:

```
Conversation · Message · Contact · Channel · Provider · Connection
```

Assim, trocar ou somar canal (WhatsApp, Instagram, outro) não reescreve o CRM.

Toda integração tem: credenciais **por tenant**, timeout, retry, logs e tratamento
de indisponibilidade.

APIs oficiais da Meta. **Nunca scraping.**

## 10. Fiscal

Nunca simulado. A emissão real depende de provedor fiscal, certificado digital e
das regras do documento/UF/município.

O sistema **jamais** apresenta emissão simulada como nota fiscal real. Mudar um
status no frontend não é emitir nota.

Previsto: NF-e, NFC-e, NFS-e, certificado digital, consulta, cancelamento,
inutilização, eventos, armazenamento de documentos, status, erros e webhooks.

## 11. Dependências

Permitido:

```
             CORE
            /    \
          ERP    CRM
            \    /
             WEB
```

Proibido: ciclo de qualquer tamanho.

```
ERP → CRM → ERP        ✗
CORE → ERP             ✗   (o Core não conhece seus módulos)
app → app              ✗
packages/* → apps/*    ✗
```

Módulos dependem de **contratos**, não de implementações uns dos outros.
Quando dois módulos precisam conversar, a conversa passa pelo Core — por evento
ou por serviço declarado.

## 12. Definition of Done

Uma tela existir não significa que a funcionalidade está pronta.

```
UI → Estado → Fluxo → Validação → Permissão → Tratamento de erro →
Loading → Empty state → Responsividade → Integração → Teste →
Documentação → Trello atualizado → PROJECT_STATE atualizado
```

## 13. Stack

| Camada             | Padrão                              | Por quê                                               |
| ------------------ | ----------------------------------- | ----------------------------------------------------- |
| Landing            | Astro 7 estático                    | Já em produção, Lighthouse ~100, zero JS de framework |
| SaaS               | Next.js + TS + Tailwind + shadcn/ui | Master Plan §4                                        |
| Banco/Auth/Storage | Supabase + PostgreSQL + RLS         | Isolamento no banco                                   |
| Deploy             | Vercel, um projeto por app          | Deploy independente                                   |
| IA                 | OpenAI API                          | Master Plan §4                                        |

Trocar tecnologia exige ADR em `docs/16-DECISIONS/`.
