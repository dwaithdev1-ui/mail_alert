export interface Meeting {
  title: string;
  // ISO string
  time: string;
}

// Example meetings – adjust times as needed
export const meetings: Meeting[] = [
  {
    title: 'Project Review Meeting',
    // 4 minutes from now for demo purposes
    time: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
  },
  {
    title: 'ECE Department Update',
    // 10 minutes from now – will appear later
    time: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  },
];
