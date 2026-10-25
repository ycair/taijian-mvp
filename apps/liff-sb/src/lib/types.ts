export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  timezone: string;
  default_household_id: string | null;
};

export type Household = {
  id: string;
  name: string;
  timezone: string;
  role: 'owner' | 'caretaker';
};

export type Animal = {
  id: string;
  household_id: string;
  name: string;
  species: string;
  species_label: string | null;
  avatar_color: string;
  sex: string;
  notes: string | null;
  status: string;
};

export type Reminder = {
  id: string;
  household_id: string;
  animal_id: string;
  title: string;
  type: string;
  schedule: {
    kind: 'daily' | 'weekly' | 'interval';
    times: string[];
    weekdays?: number[];
    everyNDays?: number;
    startDate?: string;
  };
  timezone: string;
  enabled: boolean;
  next_due_at: string | null;
};

export type Completion = {
  reminder_id: string;
  due_date: string;
  completed_by: string;
  completed_by_name: string | null;
};

export type RecordRow = {
  id: string;
  animal_id: string;
  type: string;
  occurred_at: string;
  value: number | null;
  unit: string | null;
  note: string | null;
};
