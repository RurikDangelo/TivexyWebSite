import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { previewPlanChange } from './plans.ts';

describe('previewPlanChange', () => {
  it('subir liga o que falta, na ordem do catálogo', () => {
    assert.deepEqual(
      previewPlanChange({
        planModules: ['automation', 'core', 'crm', 'erp', 'finance', 'inventory'],
        enabled: ['core', 'crm'],
        disableOutside: false,
      }),
      { enable: ['erp', 'inventory', 'finance', 'automation'], disable: [] },
    );
  });

  it('descer só desliga quando pedido, e nunca o Core', () => {
    const base = { planModules: ['crm'] as const, enabled: ['core', 'crm', 'erp'] as const };
    assert.deepEqual(previewPlanChange({ ...base, disableOutside: false }).disable, []);
    assert.deepEqual(previewPlanChange({ ...base, disableOutside: true }).disable, ['erp']);
  });
});
