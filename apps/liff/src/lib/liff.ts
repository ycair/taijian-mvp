import liff from '@line/liff';

export async function initLiff(): Promise<void> {
  const liffId = import.meta.env.VITE_LIFF_ID;
  if (!liffId) throw new Error('VITE_LIFF_ID is missing');
  await liff.init({ liffId });
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: window.location.href });
  }
}

export async function getLineIdToken(): Promise<string> {
  if (import.meta.env.VITE_USE_MOCK_LINE === 'true' && import.meta.env.DEV) {
    const mock = new URLSearchParams(window.location.search).get('mockLineIdToken');
    return mock ?? localStorage.getItem('mockLineIdToken') ?? 'test-token-A';
  }
  const token = liff.getIDToken();
  if (!token) throw new Error('LINE ID token unavailable');
  return token;
}

export async function shareInvite(url: string): Promise<void> {
  if (liff.isApiAvailable('shareTargetPicker')) {
    await liff.shareTargetPicker([{ type: 'text', text: `加入苔間家庭：${url}` }]);
    return;
  }
  await navigator.clipboard.writeText(url);
}
