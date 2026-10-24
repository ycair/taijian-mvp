import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './auth';

const DEFAULT_TIMEZONE = 'Asia/Taipei';

type Household = { id: string; name: string; timezone: string };
type HouseholdState = {
  household: Household | null;
  householdIds: string[];
  loading: boolean;
  error: string | null;
  select: (id: string) => void;
};

const HouseholdContext = createContext<HouseholdState>({
  household: null,
  householdIds: [],
  loading: true,
  error: null,
  select: () => undefined,
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

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        const ids = (snap.data()?.householdIds as string[] | undefined) ?? [];
        setHouseholdIds(ids);
        setSelectedId((current) =>
          current && ids.includes(current) ? current : (ids[0] ?? null),
        );
        setProfileLoaded(true);
      },
      (snapError) => {
        setError(`讀取家庭資料失敗：${snapError.message}`);
        setProfileLoaded(true);
      },
    );
    return unsubscribe;
  }, [user]);

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
      (snapError) => {
        setError(`讀取家庭資料失敗：${snapError.message}`);
        setResolvedId(id);
      },
    );
    return unsubscribe;
  }, [selectedId]);

  const loading = !profileLoaded || (selectedId !== null && resolvedId !== selectedId);

  const value = useMemo(
    () => ({ household, householdIds, loading, error, select: setSelectedId }),
    [household, householdIds, loading, error],
  );
  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold(): HouseholdState {
  return useContext(HouseholdContext);
}
