# ADR-002 — Ordem de construção: Core e provisionamento antes de módulos

**Data:** 18/09/2026 · **Status:** Aceita

## Contexto

O escopo do Tivexy é grande: ERP, CRM, Admin, Blueprint Engine, AI Engine,
Automation Engine, integrações, fiscal, financeiro, PWA.

Com escopo assim, a tentação é começar pelo que é visível — telas de ERP e CRM —
ou pelo que é intelectualmente mais interessante — o Blueprint Engine.

Ambos os caminhos produzem a mesma falha: um sistema que parece pronto e não
provisiona um cliente.

A Documentação Interna v1.1 é explícita: _"O primeiro objetivo técnico não é ter
muitas telas; é ter um Core confiável."_

## Decisão

Construir nesta ordem, sem pular:

```
Banco → Autenticação → Multi-tenancy → PROVISIONAMENTO → RBAC → Admin
      → CRM → ERP → Estoque → Financeiro → Integrações → Automações
      → Blueprint Engine → AI Engine → Dashboards
```

Duas regras derivadas:

1. **Provisionamento é prioridade zero.** Antes de qualquer módulo de negócio,
   o fluxo Super Admin → tenant → administrador → primeiro login precisa funcionar
   ponta a ponta, com teste E2E.

2. **Blueprint Engine só depois de um módulo real.** Blueprint é abstração sobre
   configuração de negócio. Abstrair antes de ter pelo menos um negócio concreto
   funcionando é adivinhar a forma da abstração.

## Alternativas consideradas

**Começar pelo Blueprint Engine, por ser o diferencial.** Rejeitada: sem um módulo
real, não há como saber o que precisa ser configurável. O resultado provável é um
motor genérico que não configura bem caso nenhum.

**Construir ERP e CRM em paralelo com o Core.** Rejeitada: leva a duplicar auth,
usuários, permissões e notificações dentro de cada módulo — exatamente o que este
projeto existe para evitar.

## Consequências

**Boas:** o primeiro entregável é o que sustenta a venda — conseguir criar um
cliente e colocá-lo para operar. Cada módulo posterior nasce sobre fundação pronta,
sem duplicação.

**Custo:** as primeiras semanas produzem pouca tela. O progresso é medido por
provisionamento funcionando e teste cross-tenant passando, não por quantidade
de interface.

**Teste que define o marco:**

> Super Admin cria tenant → tenant recebe administrador → administrador faz login
> → consegue operar. E: usuário do Tenant B tenta acessar recurso do Tenant A →
> acesso negado.
