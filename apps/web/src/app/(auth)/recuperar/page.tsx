import type { Metadata } from 'next';

import { AuthCard } from '../auth-card';
import { RecoverForm } from './recover-form';

export const metadata: Metadata = { title: 'Recuperar senha' };

export default function RecuperarPage() {
  return (
    <AuthCard
      titulo="Recuperar senha"
      descricao="Enviamos um link para você escolher uma senha nova. Ele vale por uma hora."
    >
      <RecoverForm />
    </AuthCard>
  );
}
