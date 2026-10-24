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
    let cancelled = false;
    // The initial `null` from `onAuthStateChanged` is not a terminal state: the
    // LINE → custom-token exchange has not settled yet. Only trust a signed-out
    // event after the exchange has finished (it also fires after our own
    // success, with a user).
    let exchangeSettled = false;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (cancelled) return;
      if (user) {
        exchangeSettled = true;
        setState({ user, loading: false, error: null });
        return;
      }
      if (!exchangeSettled) return;
      setState({ user: null, loading: false, error: null });
    });

    (async () => {
      try {
        const { redirecting } = await initLiff();
        if (cancelled || redirecting) return;
        // An existing Firebase session (warm reload) needs no LINE exchange.
        const existing = auth.currentUser;
        if (existing) {
          exchangeSettled = true;
          setState({ user: existing, loading: false, error: null });
          return;
        }
        const idToken = await getLineIdToken();
        const { token } = await callLogin(idToken);
        await signInWithCustomToken(auth, token);
        // `onAuthStateChanged` flips loading=false once the user lands.
      } catch (error) {
        if (cancelled) return;
        exchangeSettled = true;
        setState({ user: null, loading: false, error: (error as Error).message });
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
