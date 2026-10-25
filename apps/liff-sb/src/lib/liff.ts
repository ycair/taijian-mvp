import liff from '@line/liff';

const liffId = import.meta.env.VITE_LIFF_ID ?? '';
const useMock = import.meta.env.VITE_USE_MOCK_LINE === 'true' || !liffId;

export async function getLineIdToken(): Promise<string> {
  if (useMock) {
    const params = new URLSearchParams(window.location.search);
    return params.get('mock') ? `mock:${params.get('mock')}` : 'mock:UtestA';
  }
  await liff.init({ liffId });
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: window.location.href });
    throw new Error('redirecting');
  }
  const token = liff.getIDToken();
  if (!token) throw new Error('LINE ID token unavailable');
  return token;
}
