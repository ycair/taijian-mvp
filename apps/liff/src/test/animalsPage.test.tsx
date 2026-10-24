import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AnimalsPage } from '../pages/AnimalsPage';

vi.mock('../lib/household', () => ({
  useHousehold: () => ({
    household: null,
    householdIds: [],
    loading: false,
    error: null,
    select: () => undefined,
    refresh: async () => undefined,
  }),
}));
vi.mock('../lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(),
}));

describe('AnimalsPage empty states', () => {
  it('links the no-household state to the create form', () => {
    render(
      <MemoryRouter>
        <AnimalsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('還沒有家庭')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '建立家庭' })).toHaveAttribute(
      'href',
      '/household/new',
    );
  });
});
