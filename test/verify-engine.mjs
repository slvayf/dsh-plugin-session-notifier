/**
 * Headless harness for the session-end-notifier Client half.
 *
 * Loads client.js with stubbed browser globals (virtual clock, fake Notification,
 * fake AudioContext, fake React) and drives the forwarded Host events to verify
 * the reminder engine's decisions: end edge, boot noise, burst merging, repeat
 * chain, foreground suppression, waiting-for-you, subagent filtering.
 *
 * Run: node dsh-plugins/session-end-notifier/test/verify-engine.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../client.js'), 'utf8');

/* ---------- virtual clock ---------- */
let now = 0;
let timerSeq = 1;
const timers = new Map();

// The plugin reads `Date.now()` for its tone gap and its reminder log, so the wall
// clock advances with the virtual timer clock instead of with real time.
const WALL_EPOCH = 1_800_000_000_000;
Date.now = () => WALL_EPOCH + now;

function setTimer(fn, delay) {
  const id = timerSeq++;
  timers.set(id, { fn, at: now + Math.max(0, Number(delay) || 0) });
  return id;
}

function clearTimer(id) {
  timers.delete(id);
}

function advance(ms) {
  const target = now + ms;
  let guard = 0;
  for (;;) {
    if (guard++ > 10000) throw new Error('timer loop did not settle');
    let nextId = null;
    let nextAt = Infinity;
    for (const [id, timer] of timers) {
      if (timer.at <= target && timer.at < nextAt) {
        nextAt = timer.at;
        nextId = id;
      }
    }
    if (nextId === null) break;
    const timer = timers.get(nextId);
    timers.delete(nextId);
    now = timer.at;
    timer.fn();
  }
  now = target;
}

function resetClock() {
  now = 0;
  timers.clear();
}

/* ---------- browser stubs ---------- */
const notifications = [];
const chimes = [];
const storage = new Map();

class FakeAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = {};
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  createGain() {
    return {
      gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {},
      disconnect() {},
    };
  }
  createOscillator() {
    return {
      type: 'sine',
      frequency: { setValueAtTime() {} },
      connect() {},
      start() {
        chimes.push(now);
      },
      stop() {},
    };
  }
}

function FakeNotification(title, options) {
  notifications.push({ title, options, at: now });
  this.close = () => {};
}
FakeNotification.permission = 'granted';
FakeNotification.requestPermission = () => Promise.resolve('granted');

let focused = false;
let hidden = false;

const documentStub = {
  hasFocus: () => focused,
  addEventListener() {},
  removeEventListener() {},
  createElement: () => ({ setAttribute() {}, remove() {}, textContent: '' }),
  head: { appendChild() {} },
};
Object.defineProperty(documentStub, 'visibilityState', { get: () => (hidden ? 'hidden' : 'visible') });

globalThis.document = documentStub;
globalThis.Notification = FakeNotification;

const React = {
  createElement: (...args) => ({ args }),
  useReducer: (reducer, initial) => [initial, () => {}],
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect() {},
  useMemo: (fn) => fn(),
  useRef: (value) => ({ current: value }),
};

/** Session catalog rows shared by one mount, plus the main view's retain counter. */
function makeSessions(rows, viewed) {
  return {
    list: {
      getSnapshot: () => ({ ids: Object.keys(rows), byId: rows }),
      subscribe: () => () => {},
    },
    retainInfo: (sessionId) => ({
      getSnapshot: () => ({
        referenceCount: viewed.id === sessionId ? 1 : 0,
        retainedBy: viewed.id === sessionId ? { mainView: 1 } : {},
      }),
      subscribe: () => () => {},
    }),
  };
}

/**
 * Load a fresh module instance with the given preferences and drive it.
 * @param patch - preferences written to localStorage before the module reads them.
 */
function mount(patch, rows = {}) {
  resetClock();
  notifications.length = 0;
  chimes.length = 0;
  storage.clear();
  if (patch !== undefined) storage.set('dsh.session-notifier.v1', JSON.stringify(patch));

  const windowStub = {
    __ModuleLoader__: { load(registration) { windowStub.registration = registration; } },
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
    },
    setTimeout: setTimer,
    clearTimeout: clearTimer,
    setInterval: setTimer,
    clearInterval: clearTimer,
    addEventListener() {},
    removeEventListener() {},
    AudioContext: FakeAudioContext,
    focus() {},
    registration: null,
  };
  globalThis.window = windowStub;
  new Function('window', 'document', 'Notification', source)(windowStub, documentStub, FakeNotification);

  const handlers = new Map();
  const uiStatus = new Map();
  const statusListeners = new Set();
  const viewed = { id: undefined };
  const sessions = makeSessions(rows, viewed);

  const uiSession = {
    sessionStatus: {
      getSnapshot: () => uiStatus,
      subscribe: (listener) => {
        statusListeners.add(listener);
        return () => statusListeners.delete(listener);
      },
    },
  };

  const ctx = {
    locale: {
      bind: () => (key, vars) => (vars === undefined ? key : `${key}${JSON.stringify(vars)}`),
      register: () => () => {},
    },
    remote: {
      $on: (event, listener) => {
        handlers.set(event, listener);
        return () => handlers.delete(event);
      },
    },
    slots: {
      inject: (key, callback) => callback(),
      register: (options, component) => ({ options, component }),
    },
    effect: (fn) => {
      const dispose = fn();
      return typeof dispose === 'function' ? dispose : () => {};
    },
    inject: (deps, callback) =>
      callback({
        sessions,
        uiSession,
        effect: (fn) => {
          const dispose = fn();
          return typeof dispose === 'function' ? dispose : () => {};
        },
      }),
    on: () => {},
    get: (name) => {
      if (name === 'sessions') return sessions;
      if (name === 'uiSession') return uiSession;
      if (name === 'uiWorkspace') return { openSession() {} };
      return undefined;
    },
  };

  const exported = windowStub.registration.factory(() => React);
  exported.apply(ctx);

  return {
    exported,
    /** Mark which session the main view holds open. */
    setViewed: (sessionId) => {
      viewed.id = sessionId;
    },
    status: (sessionId, running) => handlers.get('api-session/status')(sessionId, running),
    error: (sessionId) => handlers.get('api-session/error')(sessionId),
    added: (summary) => handlers.get('api-session/added')(summary),
    uiStatus,
    publishStatus: () => {
      for (const listener of [...statusListeners]) listener();
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/* ---------- 1: a plain end edge reminds once ---------- */
{
  focused = false;
  hidden = false;
  const app = mount({ combineMs: 10000, repeat: false });
  app.status('s1', true);
  app.status('s1', false);
  advance(10000);
  assert(notifications.length === 1, `expected 1 notification, got ${notifications.length}`);
  assert(chimes.length > 0, 'expected a chime');
  console.log('1. end edge → one notification + chime: OK');
}

/* ---------- 2: an idle report without a running edge is ignored ---------- */
{
  focused = false;
  const app = mount({ combineMs: 10000, repeat: false });
  app.status('s2', false);
  advance(1000);
  assert(notifications.length === 0, 'boot/idle noise produced a reminder');
  console.log('2. phantom idle report ignored: OK');
}

/* ---------- 3: burst merging ---------- */
{
  focused = false;
  const app = mount({ combineMs: 10000, repeat: false });
  app.status('s3', true);
  advance(1000);
  app.status('s3', false);
  advance(2000);
  app.status('s3', true);
  advance(8000);
  assert(notifications.length === 0, 'a resumed burst still reminded');
  app.status('s3', false);
  advance(10000);
  assert(notifications.length === 1, `expected 1 merged notification, got ${notifications.length}`);
  console.log('3. burst merging: OK');
}

/* ---------- 4: repeat chain while the page is in the background ---------- */
{
  focused = false;
  const app = mount({ combineMs: 10000, repeat: true, repeatIntervalMs: 15000, repeatMax: 3 });
  app.status('s4', true);
  app.status('s4', false);
  advance(10000);
  assert(notifications.length === 1, `expected the first reminder, got ${notifications.length}`);
  advance(15000);
  assert(notifications.length === 2, `expected a repeat, got ${notifications.length}`);
  advance(15000);
  advance(15000);
  advance(15000);
  assert(notifications.length === 3, `expected the chain to stop at 3, got ${notifications.length}`);
  console.log('4. repeat chain capped: OK');
}

/* ---------- 5: foreground suppression ---------- */
{
  focused = true;
  const app = mount({ combineMs: 10000, repeat: false, whenFocused: false });
  app.status('s5', true);
  app.status('s5', false);
  advance(10000);
  assert(notifications.length === 0, 'reminded while the page was focused');
  console.log('5. foreground suppression: OK');
}

/* ---------- 6: waiting for you ---------- */
{
  focused = false;
  const app = mount({ combineMs: 10000, repeat: false, awaiting: true });
  app.uiStatus.set('s6', { running: true, pendingInteraction: { kind: 'approval' }, completionUnread: false });
  app.publishStatus();
  assert(notifications.length === 1, `expected an awaiting notification, got ${notifications.length}`);
  app.publishStatus();
  assert(notifications.length === 1, 'awaiting reminded twice for one interaction');
  app.uiStatus.set('s6', { running: true, pendingInteraction: undefined, completionUnread: false });
  app.publishStatus();
  app.uiStatus.set('s6', { running: true, pendingInteraction: { kind: 'question' }, completionUnread: false });
  app.publishStatus();
  assert(notifications.length === 2, `expected a second awaiting reminder, got ${notifications.length}`);
  console.log('6. waiting for an answer: OK');
}

/* ---------- 7: subagent sessions stay quiet ---------- */
{
  focused = false;
  const rows = { s7: { sessionId: 's7', origin: 'subagent', running: true, displayTitle: 'child' } };
  const app = mount({ combineMs: 10000, repeat: false }, rows);
  app.status('s7', true);
  app.status('s7', false);
  advance(10000);
  assert(notifications.length === 0, 'a subagent session reminded');
  console.log('7. subagents ignored: OK');
}

/* ---------- 8: a forked/summary row does not mark a parent as subagent ------ */
{
  focused = false;
  const app = mount({ combineMs: 10000, repeat: false });
  app.added({ sessionId: 's8', origin: 'subagent', parentSessionId: 'root' });
  app.status('s8', true);
  app.status('s8', false);
  advance(10000);
  assert(notifications.length === 0, 'an added subagent row still reminded');
  console.log('8. forwarded catalog filtering: OK');
}

/* ---------- 9: an error wakes with the error kind ---------- */
{
  focused = false;
  const app = mount({ combineMs: 10000, repeat: false, errors: true });
  app.error('s9');
  advance(10000);
  assert(notifications.length === 1, `expected an error reminder, got ${notifications.length}`);
  assert(notifications[0].title.includes('notify.error.title'), `unexpected title ${notifications[0].title}`);
  console.log('9. error reminder: OK');
}

/* ---------- 10: disabled master switch stays silent ---------- */
{
  focused = false;
  const app = mount({ combineMs: 10000, repeat: false, enabled: false });
  app.status('s10', true);
  app.status('s10', false);
  advance(20000);
  assert(notifications.length === 0, 'a disabled notifier still reminded');
  console.log('10. master switch off: OK');
}

/* ---------- 11: the page-focused reminder is on by default ---------- */
{
  focused = true; // the user is looking at the page
  const app = mount({ combineMs: 10000, repeat: false });
  app.status('s11', true);
  app.status('s11', false);
  advance(10000);
  assert(notifications.length === 1, `expected a default foreground reminder, got ${notifications.length}`);
  console.log('11. foreground reminder defaults on: OK');
}

/* ---------- 12: a value no control offers snaps back to the default ------ */
{
  focused = false;
  const app = mount({ combineMs: 7000, repeat: false });
  app.status('s13', true);
  app.status('s13', false);
  advance(10000);
  assert(notifications.length === 1, `expected the sanitized window to remind at 10 s, got ${notifications.length}`);
  console.log('12. out-of-range value sanitized: OK');
}

/* ---------- 13: every reminder carries a distinct notification tag ---------- */
{
  focused = false;
  const app = mount({ combineMs: 10000, repeat: false });
  app.status('s14', true);
  app.status('s14', false);
  advance(10000);
  app.status('s14', true);
  app.status('s14', false);
  advance(10000);
  assert(notifications.length === 2, `expected two reminders, got ${notifications.length}`);
  const [first, second] = notifications;
  assert(first.options.tag !== second.options.tag, 'a repeated tag would silently replace the earlier toast');
  console.log('13. unique notification tags: OK');
}

/* ---------- 14: the session you are looking at reminds almost at once ---- */
{
  focused = true;
  const app = mount({ combineMs: 10000, repeat: false });
  app.setViewed('s15');
  app.status('s15', true);
  app.status('s15', false);
  advance(1000);
  assert(notifications.length === 1, `expected the short window to remind at 1 s, got ${notifications.length}`);
  console.log('14. viewed session reminds at 1 s: OK');
}

/* ---------- 15: another session still waits out the full window ---------- */
{
  focused = true;
  const app = mount({ combineMs: 10000, repeat: false });
  app.setViewed('other');
  app.status('s16', true);
  app.status('s16', false);
  advance(1000);
  assert(notifications.length === 0, 'a session you are not looking at reminded early');
  advance(9000);
  assert(notifications.length === 1, `expected the full window, got ${notifications.length}`);
  console.log('15. other session keeps the window: OK');
}

/* ---------- 16: a hidden page never uses the short window ---------------- */
{
  focused = true;
  hidden = true;
  const app = mount({ combineMs: 10000, repeat: false });
  app.setViewed('s17');
  app.status('s17', true);
  app.status('s17', false);
  advance(1000);
  assert(notifications.length === 0, 'a hidden page reminded early');
  advance(9000);
  assert(notifications.length === 1, `expected the full window while hidden, got ${notifications.length}`);
  hidden = false;
  console.log('16. hidden page keeps the window: OK');
}

/* ---------- 17: two sessions ending together share one tone ------------ */
{
  focused = false;
  const app = mount({ combineMs: 10000, repeat: false });
  app.status('s17a', true);
  app.status('s17a', false);
  app.status('s17b', true);
  app.status('s17b', false);
  advance(10000);
  assert(notifications.length === 2, `expected two notifications, got ${notifications.length}`);
  // One "done" tone is two notes, so two stacked tones would start four oscillators.
  assert(chimes.length === 2, `expected one shared tone (2 notes), got ${chimes.length}`);
  console.log('17. simultaneous reminders share one tone: OK');
}

/* ---------- 18: a failure survives the idle edge that follows it -------- */
{
  focused = false;
  const app = mount({ combineMs: 10000, repeat: false });
  app.status('s18', true);
  app.error('s18');
  app.status('s18', false);
  advance(10000);
  assert(notifications.length === 1, `expected one reminder, got ${notifications.length}`);
  assert(
    notifications[0].title.includes('notify.error.title'),
    `expected the error copy, got ${notifications[0].title}`,
  );
  console.log('18. failure survives the idle edge: OK');
}

console.log('\nall 18 scenarios passed');
