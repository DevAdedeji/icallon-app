import type { User } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/client';

export async function ensurePlayerProfile(user: User): Promise<void> {
  const metadataUsername = user.user_metadata?.username;
  const username =
    (typeof metadataUsername === 'string' && metadataUsername.trim()) ||
    user.email?.split('@')[0] ||
    `player-${user.id.slice(0, 6)}`;

  const { error } = await supabase.from('users').upsert(
    {
      id: user.id,
      email: user.email ?? `${user.id}@player.icallon`,
      username,
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );

  if (error) throw error;
}
