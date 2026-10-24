import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './auth';
import { callCommand } from './api';
import { DEFAULT_HOUSEHOLD_TIMEZONE as DEFAULT_TIMEZONE } from './timezones';

type Household = { id: string; name: string; timezone: string };
type ProfileSnapshot = {
  householdIds?: string[];
  defaultHouseholdId?: string;
};
type HouseholdState = {
  household: Household | null;
  householdIds: string[];
  loading: boolean;
  error: string | null;
  /** Switch households and persist the choice on the profile. */
  select: (id: string) => Promise<void>;
  /** Re-read the profile after a command that changes `householdIds`. */
  refresh: () => Promise<void>;
};

const HouseholdContext = createContext<HouseholdState>({
  household: null,
  householdIds: [],
  loading: true,
  error: null,
  select: async () => undefined,
  refresh: async () => undefined,
});

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [householdIds, setHouseholdIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  // `loading` stays true until the profile *and* the selected household doc
  // have resolved, so the Today page never flashes "還沒有家庭" mid-read.
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [resolvedId, setResolvedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The default the server last confirmed. Selecting the already-default
  // household must not write the profile again on every render/tap.
  const defaultIdRef = useRef<string | null>(null);
  // `refresh()` updates state, but the `select` captured by the current render
  // still sees the old array. Mirror it in a ref so onboarding can select the
  // household it just created before the next render.
  const householdIdsRef = useRef<string[]>([]);

  const applyProfile = useCallback((profile: ProfileSnapshot | undefined) => {
    const ids = profile?.householdIds ?? [];
    const defaultId =
      typeof profile?.defaultHouseholdId === 'string' ? profile.defaultHouseholdId : null;
    defaultIdRef.current = defaultId;
    householdIdsRef.current = ids;
    setHouseholdIds(ids);
    setSelectedId((current) => {
      if (current && ids.includes(current)) return current;
      // A valid `defaultHouseholdId` wins over array order, so a user who chose
      // a household on another device opens that one, not the first joined.
      if (defaultId && ids.includes(defaultId)) return defaultId;
      return ids[0] ?? null;
    });
    setProfileLoaded(true);
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        applyProfile(snap.data() as ProfileSnapshot | undefined);
      },
      () => {
        setError('讀取家庭資料失敗，請檢查網路後重新整理。');
        setProfileLoaded(true);
      },
    );
    return unsubscribe;
  }, [user, applyProfile]);

  // The listener settles asynchronously; onboarding needs the freshly written
  // `householdIds` before it navigates to Today, otherwise the first paint can
  // still show "還沒有家庭".
  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      applyProfile(snap.data() as ProfileSnapshot | undefined);
      setError(null);
    } catch {
      setError('讀取家庭資料失敗，請檢查網路後重新整理。');
    }
  }, [user, applyProfile]);

  const select = useCallback(
    async (id: string) => {
      // Only a household the profile already lists can be selected; a stale id
      // (e.g. removed while this page was open) falls back to the listener.
      if (!householdIdsRef.current.includes(id)) return;
      setSelectedId(id);
      if (!user || defaultIdRef.current === id) return;

      try {
        const result = await callCommand('user.updateProfile', { defaultHouseholdId: id });
        if (!result.ok) {
          setError('切換家庭失敗，請確認你仍是該家庭成員。');
          return;
        }
        defaultIdRef.current = id;
        setError(null);
      } catch {
        // The switch already happened locally; keep it, but say the preference
        // was not saved so the next device may open a different household.
        setError('無法儲存預設家庭，請檢查網路後再試。');
      }
    },
    [user],
  );

  useEffect(() => {
    if (!selectedId) {
      setHousehold(null);
      return;
    }
    const id = selectedId;
    const unsubscribe = onSnapshot(
      doc(db, 'households', id),
      (snap) => {
        setHousehold(
          snap.exists()
            ? {
                id: snap.id,
                name: (snap.data().name as string | undefined) ?? '我的家庭',
                timezone: (snap.data().timezone as string | undefined) ?? DEFAULT_TIMEZONE,
              }
            : null,
        );
        setResolvedId(id);
      },
      () => {
        setError('讀取家庭資料失敗，請檢查網路後重新整理。');
        setResolvedId(id);
      },
    );
    return unsubscribe;
  }, [selectedId]);

  const loading = !profileLoaded || (selectedId !== null && resolvedId !== selectedId);

  const value = useMemo(
    () => ({
      household,
      householdIds,
      loading,
      error,
      select,
      refresh,
    }),
    [household, householdIds, loading, error, select, refresh],
  );
  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold(): HouseholdState {
  return useContext(HouseholdContext);
}
