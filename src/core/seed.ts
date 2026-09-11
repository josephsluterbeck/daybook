import type { AppData } from './types'
import { SCHEMA_VERSION } from './types'
import { addDays, todayKey, monthKey } from './dates'

export const emptyData = (): AppData => ({
  schema: SCHEMA_VERSION,
  settings: { name: 'Joseph', currency: 'USD', cycleStartDay: 1 },
  movies: [],
  games: [],
  incomes: [],
  bills: [],
  envelopes: [],
  expenses: [],
  goals: [],
  tasks: [],
  notes: [],
  allocations: [],
  debts: [],
  routines: [],
  series: [],
  projects: [],
  shopping: [],
  people: [],
  maintenance: [],
  topics: [],
  closes: [],
  scenarios: [],
})

const id = (p: string, n: number) => `${p}${n}`
const mk = monthKey()

/**
 * Example data so the app opens in a working state instead of an empty shell.
 * These are made-up figures, not anyone's real finances — "Start fresh" wipes them.
 */
export const seedData = (): AppData => ({
  ...emptyData(),
  movies: [
    { id: id('m', 1), title: 'Sinners', year: 2025, service: 'Max', priority: 3, watched: false, addedAt: todayKey() },
    { id: id('m', 2), title: 'The Brutalist', year: 2024, service: 'Rent', priority: 2, watched: false, notes: '3h35 — needs a free evening', addedAt: todayKey() },
    { id: id('m', 3), title: 'Arrival', year: 2016, service: 'Paramount+', priority: 1, watched: true, rating: 9, addedAt: todayKey() },
  ],
  games: [
    {
      id: id('g', 1),
      title: 'Silksong',
      platform: 'Steam Deck',
      price: 19.99,
      status: 'playing',
      addedAt: todayKey(),
      sessions: [
        { id: id('ps', 1), date: addDays(todayKey(), -6), hours: 5 },
        { id: id('ps', 2), date: addDays(todayKey(), -2), hours: 9 },
      ],
    },
    { id: id('g', 2), title: 'Outer Wilds', platform: 'PC', price: 24.99, status: 'wishlist', notes: 'wait for a sale', addedAt: todayKey() },
    { id: id('g', 3), title: 'Hades II', platform: 'PC', price: 29.99, status: 'backlog', addedAt: todayKey() },
    {
      id: id('g', 4),
      title: 'Tunic',
      platform: 'PC',
      price: 0,
      status: 'beaten',
      addedAt: todayKey(),
      sessions: [{ id: id('ps', 3), date: addDays(todayKey(), -30), hours: 22 }],
    },
  ],
  // anchorDate a fortnight-period ago from yesterday, so "yesterday" is the
  // most recent real payday — demoes the paycheck-allocation prompt (#13)
  // showing up on Today unprompted, the way it actually would.
  incomes: [{ id: id('i', 1), label: 'Paycheck', amount: 1450, cadence: 'biweekly', anchorDate: addDays(todayKey(), -1) }],
  bills: [
    { id: id('b', 1), label: 'Rent', amount: 1150, dueDay: 1, cadence: 'monthly', autopay: false, paid: [mk], color: '#10736a', splitAmount: 400, splitSource: 'Wife' },
    { id: id('b', 2), label: 'Car payment', amount: 312, dueDay: 12, cadence: 'monthly', autopay: true, paid: [], color: '#3d6fb4' },
    // Paid once a year, not monthly — the example #12 (irregular bills) is
    // built around: $768/year is $64/month accruing, not a $128 line that
    // was really a guess at a monthly-equivalent.
    { id: id('b', 3), label: 'Car insurance', amount: 768, dueDay: 15, cadence: 'annual', dueMonth: 3, autopay: true, paid: [], color: '#3d6fb4' },
    { id: id('b', 4), label: 'Phone', amount: 55, dueDay: 18, cadence: 'monthly', autopay: true, paid: [], color: '#c98a1f' },
    { id: id('b', 5), label: 'Internet', amount: 70, dueDay: 22, cadence: 'monthly', autopay: false, paid: [], color: '#c98a1f' },
    { id: id('b', 6), label: 'Streaming', amount: 34, dueDay: 26, cadence: 'monthly', autopay: true, paid: [], color: '#7d5ba6' },
  ],
  envelopes: [
    { id: id('e', 1), label: 'Groceries', monthly: 400, color: '#10736a' },
    { id: id('e', 2), label: 'Eating out', monthly: 150, color: '#c98a1f' },
    { id: id('e', 3), label: 'Gas', monthly: 120, color: '#3d6fb4' },
    { id: id('e', 4), label: 'Fun money', monthly: 100, color: '#7d5ba6' },
    { id: id('e', 5), label: 'Household', monthly: 60, color: '#b3562f' },
  ],
  // Oldest first — the app always appends a new expense, so the list below
  // reads the same way a real one would build up. The Spending tab reverses
  // this for display, so index 0 here ends up at the bottom, not the top.
  expenses: [
    {
      id: id('x', 5),
      date: addDays(todayKey(), -6),
      note: 'Costco run — split, some of it was household stuff',
      lines: [
        { envelopeId: id('e', 1), amount: 71.15 },
        { envelopeId: id('e', 5), amount: 25 },
      ],
    },
    { id: id('x', 4), date: addDays(todayKey(), -5), note: 'Game', lines: [{ envelopeId: id('e', 4), amount: 24.99 }] },
    { id: id('x', 3), date: addDays(todayKey(), -3), lines: [{ envelopeId: id('e', 3), amount: 41.2 }] },
    { id: id('x', 2), date: addDays(todayKey(), -2), note: 'Lunch', lines: [{ envelopeId: id('e', 2), amount: 18.5 }] },
    { id: id('x', 1), date: addDays(todayKey(), -1), note: 'Weekly shop', lines: [{ envelopeId: id('e', 1), amount: 82.4 }] },
  ],
  goals: [
    {
      id: id('s', 1),
      label: 'Emergency fund',
      kind: 'save',
      target: 6000,
      monthly: 200,
      notes: '3 months of bills',
      color: '#10736a',
      contributions: [
        { id: id('c', 1), date: addDays(todayKey(), -60), amount: 1500 },
        { id: id('c', 2), date: addDays(todayKey(), -30), amount: 200 },
        { id: id('c', 3), date: addDays(todayKey(), -14), amount: 250, source: 'Wife' },
        { id: id('c', 4), date: addDays(todayKey(), -2), amount: 200 },
      ],
      // Her paycheck autopays into this one every other week — the -14-day
      // contribution above was the last one logged, so the next occurrence
      // (14 days later, i.e. today) shows up as due, demonstrating the prompt.
      recurring: [
        { id: id('rc', 1), amount: 250, cadence: 'biweekly', anchorDate: addDays(todayKey(), -14), lastLogged: addDays(todayKey(), -14), source: 'Wife' },
      ],
    },
    {
      id: id('s', 2),
      label: 'Roth IRA',
      kind: 'invest',
      target: 7000,
      monthly: 150,
      targetDate: `${new Date().getFullYear()}-12-31`,
      color: '#3d6fb4',
      contributions: [
        { id: id('c', 5), date: addDays(todayKey(), -90), amount: 3250 },
        { id: id('c', 6), date: addDays(todayKey(), -5), amount: 150 },
      ],
      recurring: [],
    },
    {
      id: id('s', 3),
      label: 'New laptop',
      kind: 'save',
      target: 1400,
      monthly: 50,
      color: '#7d5ba6',
      contributions: [{ id: id('c', 7), date: addDays(todayKey(), -20), amount: 400 }],
      recurring: [],
    },
  ],
  tasks: [
    { id: id('t', 1), title: 'Ship the movies section', due: todayKey(), done: false, flagged: true, repeat: 'none', createdAt: todayKey() },
    { id: id('t', 2), title: 'Log this week’s expenses', due: todayKey(), done: true, flagged: false, repeat: 'weekly', createdAt: todayKey() },
    { id: id('t', 3), title: 'Dentist appointment', due: addDays(todayKey(), 2), time: '10:30', done: false, flagged: false, repeat: 'none', createdAt: todayKey() },
    {
      id: id('t', 4),
      title: 'Renew car registration',
      due: addDays(todayKey(), 9),
      done: false,
      flagged: false,
      repeat: 'none',
      createdAt: todayKey(),
      steps: [
        { id: id('st', 1), text: 'Smog check', done: true },
        { id: id('st', 2), text: 'Pay the county fee online', done: false },
        { id: id('st', 3), text: 'Print the new sticker', done: false },
      ],
    },
    { id: id('t', 5), title: 'Review budget for next month', due: addDays(todayKey(), 21), done: false, flagged: false, repeat: 'monthly', createdAt: todayKey() },
  ],
  debts: [
    // Linked to the "Car payment" bill above — the bill is what actually
    // gets paid each month; this is the payoff math sitting alongside it.
    { id: id('d', 1), label: 'Car loan', balance: 8200, apr: 6.9, minimum: 312, extra: 0, billId: id('b', 2) },
    { id: id('d', 2), label: 'Credit card', balance: 1400, apr: 22.9, minimum: 45, extra: 25 },
  ],
  routines: [
    {
      id: id('r', 1),
      label: 'Morning',
      cadence: 'daily',
      steps: [
        { id: id('rs', 1), label: 'Make the bed' },
        { id: id('rs', 2), label: 'Stretch' },
        { id: id('rs', 3), label: 'Plan the day' },
      ],
      completions: [{ date: addDays(todayKey(), -1), stepIds: [id('rs', 1), id('rs', 2)] }],
    },
    {
      id: id('r', 2),
      label: 'Sunday reset',
      cadence: 'weekly',
      weekday: 0,
      steps: [
        { id: id('rs', 4), label: 'Meal prep' },
        { id: id('rs', 5), label: 'Log the week’s expenses' },
        { id: id('rs', 6), label: 'Tidy the kitchen' },
      ],
      completions: [],
    },
  ],
  series: [
    { id: id('sv', 1), title: 'Severance', service: 'Apple TV+', season: 2, episode: 4, status: 'watching', addedAt: todayKey() },
    { id: id('sv', 2), title: 'The Bear', service: 'Hulu', season: 3, episode: 1, status: 'queued', addedAt: todayKey() },
  ],
  projects: [
    {
      id: id('pr', 1),
      label: 'Music app',
      status: 'active',
      nextAction: 'Try the Apple Music auth flow',
      lastTouched: addDays(todayKey(), -23),
      why: 'Spotify’s API kept rate-limiting the thing I actually wanted to build',
      createdAt: addDays(todayKey(), -90),
    },
    {
      id: id('pr', 2),
      label: 'Video essay on envelope budgeting',
      status: 'paused',
      nextAction: 'Rough out the first three minutes',
      lastTouched: addDays(todayKey(), -6),
      createdAt: addDays(todayKey(), -40),
    },
    {
      id: id('pr', 3),
      label: 'Daybook',
      status: 'active',
      nextAction: 'Ship the movies section',
      lastTouched: todayKey(),
      why: 'Wanted a budget app that treats "how am I doing" as one number, not a spreadsheet',
      createdAt: addDays(todayKey(), -120),
    },
  ],
  shopping: [
    { id: id('sh', 1), label: 'Milk', qty: '1 gal', aisle: 'Dairy', done: false, recurring: true, addedAt: todayKey() },
    { id: id('sh', 2), label: 'Eggs', qty: '1 dozen', aisle: 'Dairy', done: false, recurring: true, addedAt: todayKey() },
    { id: id('sh', 3), label: 'Coffee', aisle: 'Aisle 4', done: true, recurring: true, addedAt: addDays(todayKey(), -3) },
    { id: id('sh', 4), label: 'Chicken thighs', qty: '2 lb', aisle: 'Meat', done: false, recurring: false, addedAt: todayKey() },
    { id: id('sh', 5), label: 'Birthday candles', done: false, recurring: false, addedAt: todayKey() },
  ],
  people: [
    {
      id: id('pp', 1),
      name: 'Mom',
      birthday: '1968-09-18',
      lastContact: addDays(todayKey(), -4),
      contactEvery: 7,
      giftIdeas: [{ id: id('gi', 1), idea: 'The pottery class she mentioned', addedAt: addDays(todayKey(), -20) }],
    },
    {
      id: id('pp', 2),
      name: 'Dave',
      lastContact: addDays(todayKey(), -52),
      contactEvery: 30,
      giftIdeas: [],
      notes: 'College roommate — moved to Denver last year',
    },
  ],
  maintenance: [
    {
      id: id('mn', 1),
      label: 'Oil change',
      scope: 'car',
      everyDays: 180,
      everyMiles: 5000,
      lastDone: addDays(todayKey(), -200),
      lastOdometer: 42000,
      cost: 60,
    },
    { id: id('mn', 2), label: 'Registration renewal', scope: 'car', everyDays: 365, lastDone: addDays(todayKey(), -352), cost: 128 },
    { id: id('mn', 3), label: 'HVAC filter', scope: 'home', everyDays: 90, lastDone: addDays(todayKey(), -20), cost: 25 },
    { id: id('mn', 4), label: 'Password manager backup export', scope: 'tech', everyDays: 180, lastDone: addDays(todayKey(), -10) },
  ],
  topics: [
    {
      id: id('tp', 1),
      label: 'Rust',
      status: 'learning',
      lastStudied: addDays(todayKey(), -6),
      resources: [
        { id: id('rs', 1), title: 'The Rust Book', kind: 'book', done: false, url: 'https://doc.rust-lang.org/book/' },
        { id: id('rs', 2), title: 'Rustlings exercises', kind: 'project', done: false },
      ],
    },
    {
      id: id('tp', 2),
      label: 'Sourdough baking',
      status: 'comfortable',
      lastStudied: addDays(todayKey(), -90),
      resources: [{ id: id('rs', 3), title: 'The Perfect Loaf blog', kind: 'docs', done: true }],
    },
  ],
  notes: [
    {
      id: id('n', 1),
      at: new Date().toISOString(),
      text: 'App idea: the assistant layer should read the same data the screens do, so it can answer “can I afford this?” without a separate integration.',
      tags: ['daybook', 'idea'],
    },
    {
      id: id('n', 2),
      at: new Date(Date.now() - 86_400_000).toISOString(),
      text: 'Envelopes beat categories because the number you care about is what’s left, not what you spent.',
      tags: ['budget'],
    },
    {
      id: id('n', 3),
      at: new Date(Date.now() - 21 * 86_400_000).toISOString(),
      text: 'Ownership in Rust is really just "one variable is responsible for freeing this memory" — borrowing is asking to use it without taking that responsibility.',
      tags: [],
      topicId: id('tp', 1),
    },
    {
      id: id('n', 4),
      at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      text: 'A stiffer starter (less water) ferments slower and gives a more sour flavor — hydration is a real dial, not just texture.',
      tags: [],
      topicId: id('tp', 2),
    },
  ],
  closes: [],
  scenarios: [],
})
