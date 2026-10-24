import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithCustomToken,
  signOut,
  type User,
} from 'firebase/auth';
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

        const existing = auth.currentUser;
        if (existing) {
          exchangeSettled = true;
          // A warm Firebase session may belong to a different LINE account
          // (LINE's account switch, or a shared device). Ask the current LINE
          // token who it is; no token (mock/offline) means keep the session.
          let idToken: string;
          try {
            idToken = await getLineIdToken();
          } catch {
            if (!cancelled) setState({ user: existing, loading: false, error: null });
            return;
          }

          const { token, uid } = await callLogin(idToken);
          if (uid === existing.uid) {
            if (!cancelled) setState({ user: existing, loading: false, error: null });
            return;
          }

          // Sign out first: the old UID's Firestore listeners and selected
          // household must be torn down before the new identity mounts.
          await signOut(auth);
          await signInWithCustomToken(auth, token);
          return;
        }

        const idToken = await getLineIdToken();
        const { token } = await callLogin(idToken);
        await signInWithCustomToken(auth, token);
        // `onAuthStateChanged` flips loading=false once the user lands.
      } catch (error) {
        if (cancelled) return;
        exchangeSettled = true;
        // If a session survived (the LINE exchange failed before sign-out),
        // keep it; otherwise surface the failure and let the Gate offer re-login.
        const current = auth.currentUser;
        setState({
          user: current,
          loading: false,
          error: current ? null : (error as Error).message,
        });
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
