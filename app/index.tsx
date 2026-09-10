import { Redirect } from 'expo-router';

import { useAuth } from '@/features/auth/auth-context';

export default function Index() {
  const { session } = useAuth();

  return <Redirect href={session ? '/game-lobby' : '/welcome'} />;
}
