import type { Delivery, Health, MailboxRow, TeamThread, TeamThreadDetail } from '../src/types';

// Sample data for local `vite dev` with DEV_FIXTURES=1 in .dev.vars (localhost only): lets the pages be
// designed and reviewed without a database. Invented people and numbers.

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const daysAgo = (d: number) => hoursAgo(d * 24);

export const health: Health = {
  users: { sent: 1284, delivered: 1239, bounced: 21, complaints: 1, delayed: 9 },
  appyl: { settled: 2431, delivered: 2410, bounced: 18, failed: 3, complaints: 1, delayed: 37 },
  needsReply: 3,
  asOf: new Date().toISOString(),
};

export const delivery: Delivery = {
  ...health,
  days: Array.from({ length: 30 }, (_, i) => 29 - i).flatMap((d) => {
    const day = daysAgo(d).slice(0, 10);
    const bad = d === 2 ? 9 : d === 11 ? 4 : (d * 7) % 5 === 0 ? 2 : d % 3 === 0 ? 1 : 0;
    return [
      { day, appyl: true, delivered: 60 + ((d * 37) % 40), bad: Math.ceil(bad / 2) },
      { day, appyl: false, delivered: 35 + ((d * 23) % 30), bad: Math.floor(bad / 2) },
    ];
  }),
  problems: [
    { occurredAt: hoursAgo(3), type: 'bounced', recipient: 'hr@oldcompany-example.com', smtpCode: '550', detail: '5.1.1 The email account that you tried to reach does not exist.', fromAddress: 'tom.becker@mail.appyl.ai' },
    { occurredAt: hoursAgo(9), type: 'deferred', recipient: 'jobs@startup-example.io', smtpCode: '451', detail: '4.7.1 Greylisted, please try again later.', fromAddress: 'kwame.mensah@mail.appyl.ai' },
    { occurredAt: hoursAgo(26), type: 'complained', recipient: 'someone@hotmail.com', smtpCode: null, detail: null, fromAddress: null },
    { occurredAt: daysAgo(2), type: 'bounced', recipient: 'careers@closed-example.co', smtpCode: '550', detail: '5.4.1 Recipient address rejected: Access denied.', fromAddress: 'tom.becker@mail.appyl.ai' },
  ],
};

const people = [
  ['tom.becker', 'tbecker@gmx.de', 'paused', 'spam complaint', 22, 13, 7, 1, 3, 0, 4],
  ['kwame.mensah', 'kwame.m@outlook.com', 'active', null, 36, 33, 2, 0, 12, 4, 22],
  ['maria.gonzalez', 'maria.gonzalez@gmail.com', 'active', null, 48, 47, 0, 0, 29, 9, 31],
  ['priya.raman', 'priya.raman@yahoo.com', 'active', null, 31, 31, 0, 0, 20, 7, 18],
  ['aisha.bello', 'aisha.bello@gmail.com', 'active', null, 19, 19, 0, 0, 0, 0, 6],
  ['samuel.okafor', 'sam.okafor@gmail.com', 'active', null, 14, 13, 1, 0, 8, 2, 11],
  ['emma.larsen', 'emma.larsen@proton.me', 'active', null, 9, 9, 0, 0, 5, 1, 3],
  ['li.wei', 'liwei.dev@icloud.com', 'testing', null, 0, 0, 0, 0, 0, 0, 0],
] as const;

export const mailboxes: MailboxRow[] = people.map(([local, owner, status, pausedReason, sent, delivered, bounced, complained, opened, clicked, received], i) => ({
  id: `00000000-0000-4000-8000-00000000000${i}`,
  address: `${local}@mail.appyl.ai`,
  ownerEmail: owner,
  status,
  pausedReason,
  verifiedAt: status === 'testing' ? null : daysAgo(i === 4 ? 3 : 10 + i * 3),
  createdAt: daysAgo(i === 7 ? 2 : 11 + i * 3),
  sent,
  delivered,
  bounced,
  complained,
  opened,
  clicked,
  received,
  lastAt: sent || received ? hoursAgo(2 + i * 7) : null,
}));

const base = { unreadCount: 0, messageCount: 1, lastDirection: 'inbound' as const, teamDoneAt: null, lastSentBy: null };
export const threads: TeamThread[] = [
  { ...base, id: '10000000-0000-4000-8000-000000000001', mailbox: 'hello@info.appyl.ai', subject: 'Re: Next steps: Where Appyl is headed', counterpartAddress: 'maria.gonzalez@gmail.com', counterpartName: 'Maria Gonzalez', snippet: 'Thanks for the update! Will the cover letter part come back too? I used it for three applications last week and two replied.', unreadCount: 1, lastMessageAt: hoursAgo(1), userName: 'Maria Gonzalez', userSince: daysAgo(16) },
  { ...base, id: '10000000-0000-4000-8000-000000000002', mailbox: 'hello@info.appyl.ai', subject: 'Re: Next steps: Where Appyl is headed', counterpartAddress: 'kwame.m@outlook.com', counterpartName: 'Kwame Mensah', snippet: 'Quick question: are my matched jobs still updating while the agent is paused?', unreadCount: 1, lastMessageAt: hoursAgo(5), userName: 'Kwame Mensah', userSince: daysAgo(18) },
  { ...base, id: '10000000-0000-4000-8000-000000000003', mailbox: 'inbox@jobs.appyl.ai', subject: 'Re: 3 unread emails in your Appyl Mailbox', counterpartAddress: 'priya.raman@yahoo.com', counterpartName: 'Priya Raman', snippet: 'Can I get this summary in the morning instead of the evening? I am in Singapore.', unreadCount: 2, messageCount: 2, lastMessageAt: hoursAgo(20), userName: 'Priya Raman', userSince: daysAgo(20) },
  { ...base, id: '10000000-0000-4000-8000-000000000004', mailbox: 'hello@info.appyl.ai', subject: 'Re: Next steps: Where Appyl is headed', counterpartAddress: 'lukas.weber@gmx.de', counterpartName: 'Lukas Weber', snippet: 'Thanks, understood. Looking forward to it.', lastMessageAt: daysAgo(2), teamDoneAt: daysAgo(1.8), userName: 'Lukas Weber', userSince: daysAgo(14) },
  { ...base, id: '10000000-0000-4000-8000-000000000005', mailbox: 'hello@info.appyl.ai', subject: 'Re: Next steps: Where Appyl is headed', counterpartAddress: 'j.ortiz@example.org', counterpartName: null, snippet: 'Hi, yes. Open Applications and use Export at the top right.', messageCount: 2, lastDirection: 'outbound', lastSentBy: 'joel@appyl.ai', lastMessageAt: daysAgo(3), userName: null, userSince: null },
];

export function thread(id: string): TeamThreadDetail | null {
  const t = threads.find((x) => x.id === id);
  if (!t) return null;
  const messages: TeamThreadDetail['messages'] = [
    { id: `${id}-1`, direction: 'inbound', fromAddress: t.counterpartAddress, fromName: t.counterpartName, text: `Hi Joel and Andrews,\n\n${t.snippet}\n\nBest,\n${t.counterpartName?.split(' ')[0] ?? 'J'}`, status: 'received', sentBy: null, at: t.lastMessageAt },
  ];
  if (t.lastDirection === 'outbound') {
    messages[0]!.text = 'Is there a way to export my tracker before the agent comes back?';
    messages[0]!.at = daysAgo(4);
    messages.push({ id: `${id}-2`, direction: 'outbound', fromAddress: t.mailbox, fromName: 'Appyl', text: 'Hi, yes. Open Applications and use Export at the top right. It downloads a CSV of every application.\n\nJoel', status: 'delivered', sentBy: 'joel@appyl.ai', at: daysAgo(3) });
  }
  return { thread: { ...t, unreadCount: 0 }, messages };
}
