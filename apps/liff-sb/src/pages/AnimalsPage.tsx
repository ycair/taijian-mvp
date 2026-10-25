import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../App';
import { callCommand, newCommandId } from '../lib/api';
import { makeClient } from '../lib/supabase';
import type { Animal } from '../lib/types';

const SPECIES = [
  ['leopard-gecko', '豹紋守宮'],
  ['corn-snake', '玉米蛇'],
  ['green-horned-frog', '綠角蛙'],
  ['bearded-dragon', '鬃獅蜥'],
  ['other', '其他'],
];

export function AnimalsPage() {
  const { token, householdId } = useApp();
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [name, setName] = useState('');
  const [species, setSpecies] = useState('leopard-gecko');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!householdId) return;
    const { data, error: loadError } = await makeClient(token)
      .from('animals')
      .select('*')
      .eq('household_id', householdId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('name');
    if (loadError) setError(loadError.message);
    else setAnimals(data ?? []);
  }

  useEffect(() => {
    load();
  }, [householdId]);

  async function addAnimal() {
    if (!householdId || !name.trim()) return;
    setBusy(true);
    setError('');
    const result = await callCommand(token, {
      commandId: newCommandId(),
      type: 'animal.create',
      householdId,
      payload: {
        name: name.trim(),
        species,
        speciesLabel: SPECIES.find(([id]) => id === species)?.[1] ?? species,
        sex: 'unknown',
        avatarColor: '#7C9A76',
      },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setName('');
    load();
  }

  if (!householdId) {
    return <div className="app"><h1 className="h1">請先建立家庭</h1><Link to="/settings" className="btn" style={{ display: 'grid', placeItems: 'center', textDecoration: 'none' }}>前往設定</Link></div>;
  }

  return (
    <div className="app">
      <div className="kicker">Residents</div>
      <h1 className="h1">我的居民</h1>
      {error && <p className="error">{error}</p>}
      <div className="card stack" style={{ marginTop: 16 }}>
        {animals.length === 0 && <p className="muted">還沒有居民，先新增第一隻。</p>}
        {animals.map((animal) => (
          <Link key={animal.id} to={`/animals/${animal.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="animal">
              <div className="avatar" style={{ background: animal.avatar_color }} />
              <div>
                <div style={{ fontWeight: 700 }}>{animal.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>{animal.species_label ?? animal.species}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
      <div className="card stack" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 700 }}>新增居民</div>
        <input className="input" placeholder="名字" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="input" value={species} onChange={(e) => setSpecies(e.target.value)}>
          {SPECIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <button className="btn" onClick={addAnimal} disabled={busy || !name.trim()}>{busy ? '儲存中…' : '建立居民'}</button>
      </div>
    </div>
  );
}
