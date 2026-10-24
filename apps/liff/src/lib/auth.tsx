import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithCustomToken, type User } from 'firebase/auth';
import { auth } from './firebase';
import { getLineIdToken, initLiff } from './liff';
import { callLogin } from './api';

type AuthState = { user: User | null; loading: boolean; error: string | null };
const AuthContext = createContext<AuthState>({ user: null, loading: true, error: null });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, error: null });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setState((prev) => ({ ...prev, user, loading: false }));
    });
    (async () => {
      try {
        await initLiff();
        if (!auth.currentUser) {
          const idToken = await getLineIdToken();
          const { token } = await callLogin(idToken);
          await signInWithCustomToken(auth, token);
        }
      } catch (error) {
        setState({ user: null, loading: false, error: (error as Error).message });
      }
    })();
    return unsubscribe;
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
