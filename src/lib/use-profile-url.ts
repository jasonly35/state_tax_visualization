// Profile <-> URL hash sync. Keeps the URL shareable.

import { useQueryState } from 'nuqs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_PROFILE,
  deserializeProfile,
  serializeProfile,
  type Profile,
} from './profile';

export function useProfileUrl() {
  const [encoded, setEncoded] = useQueryState('p', {
    defaultValue: '',
    history: 'replace',
  });

  // Initialize state from URL once on mount; subsequent updates flow profile -> URL.
  const initial = useMemo(() => {
    if (!encoded) return DEFAULT_PROFILE;
    const parsed = deserializeProfile(encoded);
    return parsed ?? DEFAULT_PROFILE;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [profile, setProfile] = useState<Profile>(initial);

  // Push profile changes back to the URL query.
  useEffect(() => {
    const s = serializeProfile(profile);
    if (s !== encoded) {
      setEncoded(s);
    }
  }, [profile, encoded, setEncoded]);

  const update = useCallback(<K extends keyof Profile>(key: K, value: Profile[K]) => {
    setProfile((p) => ({ ...p, [key]: value }));
  }, []);

  const reset = useCallback(() => setProfile(DEFAULT_PROFILE), []);

  return { profile, setProfile, update, reset };
}
