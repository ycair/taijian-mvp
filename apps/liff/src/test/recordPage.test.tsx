import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { RecordPage } from '../pages/RecordPage';

vi.mock('../lib/household', () => ({
  useHousehold: () => ({
    household: { id: 'h1', name: '苔間', timezone: 'Asia/Taipei' },
    householdIds: ['h1'],
    loading: false,
    error: null,
    select: () => undefined,
    refresh: async () => undefined,
  }),
}));

describe('RecordPage', () => {
  it('redirects to the resident list when animalId is missing', () => {
    render(
      <MemoryRouter initialEntries={['/record/new']}>
        <Routes>
          <Route path="/record/new" element={<RecordPage />} />
          <Route path="/animals" element={<div>居民列表</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('居民列表')).toBeInTheDocument();
    expect(screen.queryByText('請先選擇居民。')).not.toBeInTheDocument();
  });
});
