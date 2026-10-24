import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SPECIES } from '@taijian/domain';
import { AppShell } from '../components/AppShell';
import { PrimaryButton } from '../components/PrimaryButton';
import { useHousehold } from '../lib/household';
import { callCommand } from '../lib/api';
import { callErrorMessage, commandErrorMessage } from '../lib/errorMessages';

export function AnimalNewPage() {
  const { household } = useHousehold();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [species, setSpecies] = useState(SPECIES[0]?.id ?? 'other');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!household || !name.trim() || busy) return;
    setBusy(true);
    setError('');
    const selected = SPECIES.find((item) => item.id === species);
    try {
      const result = await callCommand(
        'animal.create',
        {
          name: name.trim(),
          species,
          ...(selected ? { speciesLabel: selected.name } : {}),
          sex: 'unknown',
          avatarColor: '#7C9A76',
        },
        { householdId: household.id },
      );
      if (!result.ok) {
        setError(commandErrorMessage(result.code, '無法建立居民，請稍後再試。'));
        return;
      }
      const { animalId } = result.data as { animalId: string };
      navigate(`/animals/${animalId}`);
    } catch (error_) {
      setError(callErrorMessage(error_, '無法建立居民，請檢查網路後再試。'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="kicker">New resident</div>
      <h1 className="h1">新增居民</h1>
      {!household ? (
        <p className="muted">請先加入家庭，才能新增居民。</p>
      ) : (
        <div className="card" style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          <label>
            <span className="muted">名字</span>
            <input
              aria-label="名字"
              value={name}
              onChange={(event) => setName(event.target.value)}
              style={{
                width: '100%',
                minHeight: 48,
                borderRadius: 12,
                border: '1px solid var(--line)',
                padding: '0 12px',
                marginTop: 4,
              }}
            />
          </label>
          <label>
            <span className="muted">物種</span>
            <select
              aria-label="物種"
              value={species}
              onChange={(event) => setSpecies(event.target.value)}
              style={{
                width: '100%',
                minHeight: 48,
                borderRadius: 12,
                border: '1px solid var(--line)',
                padding: '0 12px',
                marginTop: 4,
              }}
            >
              {SPECIES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p role="alert" style={{ color: 'var(--overdue)', margin: 0 }}>
              {error}
            </p>
          )}
          <PrimaryButton type="button" onClick={submit} disabled={busy || !name.trim()}>
            {busy ? '儲存中…' : '建立居民'}
          </PrimaryButton>
        </div>
      )}
    </AppShell>
  );
}
