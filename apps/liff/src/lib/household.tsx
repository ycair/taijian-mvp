import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './auth';

type Household = { id: string; name: string };
type HouseholdState = {
  household: Household | null;
  householdIds: string[];
  loading: boolean;
  select: (id: string) => void;
};

const HouseholdContext = createContext<HouseholdState>({
  household: null,
  householdIds: [],
  loading: true,
  select: () => undefined,
});

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [householdIds, setHouseholdIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      const ids = (snap.data()?.householdIds as string[] | undefined) ?? [];
      setHouseholdIds(ids);
      setSelectedId((current) => current ?? ids[0] ?? null);
      setLoading(false);
    });
  }, [user]);

  useEffect(() => {
    if (!selectedId) {
      setHousehold(null);
      return;
    }
    return onSnapshot(doc(db, 'households', selectedId), (snap) => {
      if (!snap.exists()) return;
      setHousehold({ id: snap.id, name: snap.data().name as string });
    });
  }, [selectedId]);

  const value = useMemo(
    () => ({ household, householdIds, loading, select: setSelectedId }),
    [household, householdIds, loading],
  );
  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold(): HouseholdState {
  return useContext(HouseholdContext);
}
