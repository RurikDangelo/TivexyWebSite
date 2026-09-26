/**
 * O Admin em português: situação da empresa, execução e etapa de
 * provisionamento, e as ações que a auditoria registra.
 *
 * `Record` sobre os tipos do Core: um estado novo no enum não compila até
 * ganhar rótulo — e rótulo esquecido é código de banco na tela.
 */

import type {
  ProvisioningStatus,
  ProvisioningStep,
  ProvisioningStepStatus,
  TenantStatus,
} from '@tivexy/core';

export type Tom = 'success' | 'warning' | 'danger' | 'neutral' | 'brand';

export const SITUACAO: Readonly<Record<TenantStatus, { rotulo: string; tom: Tom }>> = {
  provisioning: { rotulo: 'Em provisionamento', tom: 'warning' },
  active: { rotulo: 'Ativa', tom: 'success' },
  suspended: { rotulo: 'Suspensa', tom: 'danger' },
  cancelled: { rotulo: 'Cancelada', tom: 'neutral' },
};

export const EXECUCAO: Readonly<Record<ProvisioningStatus, { rotulo: string; tom: Tom }>> = {
  pending: { rotulo: 'Na fila', tom: 'neutral' },
  running: { rotulo: 'Em andamento', tom: 'warning' },
  succeeded: { rotulo: 'Concluído', tom: 'success' },
  failed: { rotulo: 'Parou', tom: 'danger' },
  compensating: { rotulo: 'Desfazendo', tom: 'warning' },
  compensated: { rotulo: 'Desfeito', tom: 'neutral' },
};

export const ETAPA: Readonly<Record<ProvisioningStepStatus, string>> = {
  pending: 'pendente',
  running: 'rodando',
  succeeded: 'feita',
  failed: 'falhou',
  skipped: 'pulada',
  compensated: 'desfeita',
};

export const NOME_DA_ETAPA: Readonly<Record<ProvisioningStep, string>> = {
  create_tenant: 'Criar a empresa',
  apply_plan: 'Aplicar o plano',
  enable_modules: 'Ligar os módulos',
  create_roles: 'Criar os papéis',
  create_admin: 'Criar o administrador',
  seed_defaults: 'Semear os padrões do nicho',
  send_invite: 'Gerar o acesso',
};

/** As ações de plataforma sobre a empresa, como a auditoria as grava. */
export const ACAO_DE_PLATAFORMA: Readonly<Record<string, string>> = {
  'tenant.provisioned': 'Provisionada',
  'tenant.provisioning_compensated': 'Provisionamento desfeito',
  'tenant.updated': 'Dados editados',
  'tenant.suspended': 'Suspensa',
  'tenant.reactivated': 'Reativada',
  'tenant.plan_changed': 'Plano trocado',
};

export const ACOES_DE_PLATAFORMA = Object.keys(ACAO_DE_PLATAFORMA);
