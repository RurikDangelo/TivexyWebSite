import type { Metadata } from 'next';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { RecoverForm } from './recover-form';

export const metadata: Metadata = { title: 'Recuperar senha' };

export default function RecuperarPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Recuperar senha</CardTitle>
        <CardDescription>
          Enviamos um link para você escolher uma senha nova. Ele vale por uma hora.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RecoverForm />
      </CardContent>
    </Card>
  );
}
