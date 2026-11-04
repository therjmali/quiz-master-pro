import './setup';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_NOTIFY_SETTINGS, inQuietHours, isOurNotificationId, parseHM, planNotifications, type PlannerInput } from '../src/platform/notify/planner';

// Tue 3 Nov 2026, 10:00 local
const NOW = new Date(2026, 10, 3, 10, 0, 0);
const base = (over: Partial<PlannerInput> = {}): PlannerInput => ({
  now: NOW,
  settings: { ...DEFAULT_NOTIFY_SETTINGS, enabled: true },
  reminder: { enabled: false, time: '09:00', days: [1, 2, 3, 4, 5] },
  exams: [], studiedToday: false, dueCount: 0, streakDays: 0, ...over,
});
const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

test('nothing is planned until notifications are switched on', () => {
  assert.deepEqual(planNotifications(base({ settings: { ...DEFAULT_NOTIFY_SETTINGS, enabled: false }, dueCount: 5, streakDays: 3 })), []);
});

test('the daily reminder follows the chosen weekdays and skips a day already studied', () => {
  const reminder = { enabled: true, time: '18:15', days: [2, 4] };           // Tue + Thu
  const plan = planNotifications(base({ reminder })).filter(p => p.kind === 'daily');
  assert.deepEqual(plan.map(p => p.at.getDay()), [2, 4], 'Tue (today) and Thu inside the 7-day window');
  assert.ok(plan.every(p => hm(p.at) === '18:15'));
  const studied = planNotifications(base({ reminder, studiedToday: true })).filter(p => p.kind === 'daily');
  assert.deepEqual(studied.map(p => p.at.getDay()), [4], "today's reminder is skipped once you have studied");
});

test('a reminder time that already passed today is not scheduled for today', () => {
  const plan = planNotifications(base({ reminder: { enabled: true, time: '09:00', days: [0, 1, 2, 3, 4, 5, 6] } })).filter(p => p.kind === 'daily');
  assert.equal(plan[0].at.getDate(), 4, 'first one is tomorrow 09:00');
});

test('due-review nudges only appear when cards are due and carry the count for today', () => {
  assert.equal(planNotifications(base({ dueCount: 0 })).filter(p => p.kind === 'due').length, 0);
  const plan = planNotifications(base({ dueCount: 12 })).filter(p => p.kind === 'due');
  assert.equal(plan.length, 7);
  assert.match(plan[0].body, /12 cards are ready/);
  assert.match(plan[1].body, /flashcards waiting/);
  assert.match(planNotifications(base({ dueCount: 1 })).filter(p => p.kind === 'due')[0].body, /1 card is ready/);
});

test('the streak saver needs a streak, and stays quiet today once you have studied', () => {
  assert.equal(planNotifications(base({ streakDays: 0 })).filter(p => p.kind === 'streak').length, 0);
  const risk = planNotifications(base({ streakDays: 6 })).filter(p => p.kind === 'streak');
  assert.equal(risk[0].at.getDate(), 3); assert.match(risk[0].title, /6-day streak at risk/);
  const done = planNotifications(base({ streakDays: 6, studiedToday: true })).filter(p => p.kind === 'streak');
  assert.equal(done[0].at.getDate(), 4, "tomorrow's is kept, today's is skipped");
});

test('exam countdown alerts land at 09:00 on each milestone that is still in the future', () => {
  const exams = [{ id: 'e1', subject: 'NORCET', date: '2026-11-20' }];
  const plan = planNotifications(base({ exams })).filter(p => p.kind === 'exam');
  assert.deepEqual(plan.map(p => p.title), ['NORCET exam in 14 days', 'NORCET exam in 7 days', 'NORCET exam in 3 days', 'NORCET exam in 1 day', 'NORCET exam is today']);
  assert.ok(plan.every(p => hm(p.at) === '09:00'));
  assert.deepEqual(plan.map(p => p.at.getDate()), [6, 13, 17, 19, 20]);
  assert.equal(planNotifications(base({ exams: [{ id: 'x', subject: 'Old', date: '2026-10-01' }] })).filter(p => p.kind === 'exam').length, 0);
  assert.equal(planNotifications(base({ exams: [{ id: 'x', subject: 'Bad', date: 'not-a-date' }] })).length, 0);
});

test('quiet hours (crossing midnight) silence notifications and can be turned off', () => {
  const quiet = { on: true, start: '22:00', end: '07:00' };
  const at = (h: number, m = 0) => new Date(2026, 10, 3, h, m);
  assert.equal(inQuietHours(at(23), quiet), true);
  assert.equal(inQuietHours(at(3), quiet), true);
  assert.equal(inQuietHours(at(7), quiet), false);
  assert.equal(inQuietHours(at(12), quiet), false);
  assert.equal(inQuietHours(at(23), { ...quiet, on: false }), false);
  const night = planNotifications(base({ reminder: { enabled: true, time: '23:30', days: [0, 1, 2, 3, 4, 5, 6] } })).filter(p => p.kind === 'daily');
  assert.equal(night.length, 0, 'a 23:30 reminder falls inside quiet hours');
  const free = planNotifications(base({ settings: { ...DEFAULT_NOTIFY_SETTINGS, enabled: true, quiet: { ...quiet, on: false } }, reminder: { enabled: true, time: '23:30', days: [0, 1, 2, 3, 4, 5, 6] } })).filter(p => p.kind === 'daily');
  assert.equal(free.length, 7);
});

test('weekly summary fires on the chosen weekday only', () => {
  const settings = { ...DEFAULT_NOTIFY_SETTINGS, enabled: true, weekly: { on: true, day: 0, time: '18:00' } };
  const plan = planNotifications(base({ settings })).filter(p => p.kind === 'weekly');
  assert.equal(plan.length, 1); assert.equal(plan[0].at.getDay(), 0);
});

test('plans are sorted, uniquely numbered, capped, and recognisable as ours', () => {
  const plan = planNotifications(base({
    reminder: { enabled: true, time: '12:00', days: [0, 1, 2, 3, 4, 5, 6] }, dueCount: 3, streakDays: 4,
    exams: [{ id: 'e', subject: 'X', date: '2026-12-01' }], horizonDays: 30, maxItems: 20,
  }));
  assert.equal(plan.length, 20);
  assert.ok(plan.every((p, i) => i === 0 || p.at >= plan[i - 1].at), 'chronological');
  assert.equal(new Set(plan.map(p => p.id)).size, plan.length, 'unique ids');
  assert.ok(plan.every(p => isOurNotificationId(p.id)));
  assert.equal(isOurNotificationId(7), false);
});

test('time parsing is forgiving', () => {
  assert.deepEqual(parseHM('7:05'), [7, 5]);
  assert.deepEqual(parseHM('25:99'), [23, 59]);
  assert.deepEqual(parseHM('nonsense'), [9, 0]);
});
