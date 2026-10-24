import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './auth';
import { DEFAULT_HOUSEHOLD_TIMEZONE as DEFAULT_TIMEZONE } from './timezones';

type Household = { id: string; name: string; timezone: string };
type HouseholdState = {
  household: Household | null;
  householdIds: string[];
  loading: boolean;
  error: string | null;
  select: (id: string) => void;
  /** Re-read the profile after a command that changes `householdIds`. */
  refresh: () => Promise<void>;
};

const HouseholdContext = createContext<HouseholdState>({
  household: null,
  householdIds: [],
  loading: true,
  error: null,
  select: () => undefined,
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

  const applyIds = useCallback((ids: string[]) => {
    setHouseholdIds(ids);
    setSelectedId((current) =>
      current && ids.includes(current) ? current : (ids[0] ?? null),
    );
    setProfileLoaded(true);
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        applyIds((snap.data()?.householdIds as string[] | undefined) ?? []);
      },
      () => {
        setError('讀取家庭資料失敗，請檢查網路後重新整理。');
        setProfileLoaded(true);
      },
    );
    return unsubscribe;
  }, [user, applyIds]);

  // The listener settles asynchronously; onboarding needs the freshly written
  // `householdIds` before it navigates to Today, otherwise the first paint can
  // still show "還沒有家庭".
  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      applyIds((snap.data()?.householdIds as string[] | undefined) ?? []);
      setError(null);
    } catch {
      setError('讀取家庭資料失敗，請檢查網路後重新整理。');
    }
  }, [user, applyIds]);

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
      select: setSelectedId,
      refresh,
    }),
    [household, householdIds, loading, error, refresh],
  );
  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold(): HouseholdState {
  return useContext(HouseholdContext);
}
