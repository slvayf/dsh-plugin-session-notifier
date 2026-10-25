/**
 * Browser half of the dsh-plugin-session-notifier bundle.
 *
 * Reminds the user — with a desktop notification and a short synthesized chime —
 * that a session stopped running or is waiting for an answer, so a task that
 * finishes while they are watching a video or playing a game is not missed.
 *
 * Detection has two sources, both forwarded Host events or shipped services:
 *  - `api-session/status` (forwarded) gives every agent's running ⇄ idle edges.
 *  - `uiSession.sessionStatus` (the shipped Session UI status source) reports a
 *    pending interaction, which is the composed "waiting for you" fact that the
 *    approval and question plugins publish.
 *
 * The panel under the left sidebar entry owns the preferences; the reminder engine
 * lives in `apply` so it works whether or not that panel is open.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-session-notifier',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace and the panel id shared by the sidebar entry and the main panel. */
    const NS = 'session-notifier';
    const PANEL_ID = 'session-notifier';
    const SETTINGS_KEY = 'dsh.session-notifier.v1';
    const NOTIFICATION_TAG = 'dsh-session-notifier';
    /** Monotonic per-page counter: two reminders in one millisecond still need distinct tags. */
    let notificationSeq = 0;
    const RECENT_LIMIT = 12;
    /** Shown at the foot of the panel; scripts/sync-version.mjs keeps it in step with package.json. */
    const PLUGIN_VERSION = '0.1.2';
    /** Wait before reminding about the session the user is looking at. */
    const VIEWING_MERGE_MS = 1000;
    /** Two reminders landing together share one tone instead of stacking two. */
    const TONE_GAP_MS = 250;

    //#region copy
    const zh = {
      'panel.label': '会话提醒',
      'panel.title': '会话提醒',
      'panel.desc':
        '会话跑完或停下来等你回答时，用桌面通知和提示音提醒你。切到别的窗口、全屏看视频或打游戏时也不会错过。',
      'group.master': '总开关',
      'switch.enabled': '启用提醒',
      'switch.enabled.desc': '关掉后既不响也不弹通知，设置会保留。',
      'group.methods': '提醒方式',
      'switch.desktop': '桌面系统通知',
      'switch.desktop.desc': '浏览器在后台也能看到，点通知可以跳回对应会话。',
      'switch.sound': '提示音',
      'switch.sound.desc': '浏览器现场合成，不需要额外的音频文件。',
      'group.events': '提醒时机',
      'switch.awaiting': '等我回答时也提醒',
      'switch.awaiting.desc': '智能体提问或等待工具授权时，会话会一直卡着，这种提醒更急促。',
      'switch.focused': '页面在前台时也提醒',
      'switch.focused.desc': '默认开着，智能体一停就提醒，如果你希望正看着页面时不打扰，可以关掉。',
      'switch.errors': '出错时也提醒',
      'switch.errors.desc': '会话因错误中断时，用低沉的提示音区分于正常结束。',
      'group.repeat': '重复提醒',
      'switch.repeat': '没回来看就再提醒',
      'switch.repeat.desc': '窗口还没回到前台时重复提醒，直到你把页面切回来。',
      'select.combine': '合并连续活动',
      'select.combine.desc': '智能体停一下又很快继续时，把这段时间里的动静合并成一次提醒，避免连环响。你正看着的那个会话会立即提醒。',
      'select.interval': '重复间隔',
      'select.max': '最多提醒',
      'combine.10': '10 秒',
      'combine.20': '20 秒',
      'combine.30': '30 秒',
      'interval.15': '15 秒',
      'interval.30': '30 秒',
      'interval.60': '60 秒',
      'max.2': '2 次',
      'max.3': '3 次',
      'max.5': '5 次',
      'action.test': '测试提醒',
      'action.test.desc': '立刻响一次提示音，并弹出一条桌面通知。',
      'probe.pending': '正在测试：提示音已响，等待系统确认通知…',
      'probe.shown': '已创建通知，系统已接收并显示。若仍没看到，请检查系统通知设置或勿扰模式。',
      'probe.unconfirmed': '已创建通知，但系统没有回报显示——多半是系统通知设置或勿扰模式拦下了。',
      'probe.failed': '系统拒绝了这条通知。',
      'probe.threw': '浏览器创建这条通知时出错，详情见控制台。',
      'probe.permission': '浏览器还没授权桌面通知，请先点上面的「授权桌面通知」。',
      'probe.unsupported': '当前环境不支持桌面通知，只能用提示音。',
      'probe.disabled': '桌面通知开关是关的。',
      'probe.toggleOff': '注意：桌面通知开关当前是关闭的，真实提醒只会响提示音。',
      'action.permission': '授权桌面通知',
      'permission.granted': '桌面通知：已授权',
      'permission.default': '桌面通知：尚未授权',
      'permission.denied': '桌面通知：已被浏览器拒绝。请在地址栏的站点设置里改为「允许」后刷新页面。',
      'permission.unsupported': '当前环境不支持桌面通知，只能使用提示音。',
      'banner.background': '提醒由这个页面发出：请保持 DSH 标签页在后台开着，关掉页面就不会再提醒。',
      'recent.title': '最近的提醒',
      'recent.empty': '还没有提醒记录。',
      'recent.hint': '只保留在当前页面：刷新或关闭页面就会清空。',
      'recent.audioOnly': '仅提示音',
      'kind.done': '已结束',
      'kind.awaiting': '等你回答',
      'kind.error': '出错',
      'notify.done.title': '会话已结束',
      'notify.done.body': '「{name}」刚刚跑完了，回来看一眼吧。',
      'notify.awaiting.title': '会话在等你回答',
      'notify.awaiting.body': '「{name}」停下来了，需要你的回答或授权。',
      'notify.error.title': '会话出错了',
      'notify.error.body': '「{name}」执行时出错，回来看一下。',
      'notify.test.title': '这是一条测试提醒',
      'notify.test.body': '看到这条通知、听到提示音，就说明提醒已经生效。',
      'session.unknown': '新会话',
      'footer.version': '版本 {version}',
    };

    const en = {
      'panel.label': 'Session Notifier',
      'panel.title': 'Session Notifier',
      'panel.desc':
        'A desktop notification and a short chime when a session finishes or stops to wait for you — so a task that ends while you are on another window is not missed.',
      'group.master': 'Master switch',
      'switch.enabled': 'Enable reminders',
      'switch.enabled.desc': 'Turning this off keeps the settings but stops every reminder.',
      'group.methods': 'How to remind you',
      'switch.desktop': 'Desktop notification',
      'switch.desktop.desc': 'Visible while the browser is in the background, and clicking it jumps back to the session.',
      'switch.sound': 'Chime',
      'switch.sound.desc': 'Synthesized in the browser, so no audio file is shipped.',
      'group.events': 'When to remind you',
      'switch.awaiting': 'Also remind me while waiting for an answer',
      'switch.awaiting.desc': 'While the agent asks you something or waits for a tool approval, the session stays stuck, so this reminder is more urgent.',
      'switch.focused': 'Remind me even while the page is in the foreground',
      'switch.focused.desc': 'On by default: the agent is announced as soon as it stops. Turn it off to stay quiet while you are looking at the page.',
      'switch.errors': 'Also remind me about failures',
      'switch.errors.desc': 'A session interrupted by an error uses a lower chime, distinct from a normal finish.',
      'group.repeat': 'Repeat reminders',
      'switch.repeat': 'Remind me again if I do not come back',
      'switch.repeat.desc': 'Keeps repeating while the window stays in the background.',
      'select.combine': 'Merge bursts',
      'select.combine.desc': 'When the agent pauses and quickly continues, the activity in this window is merged into one reminder instead of several chimes. The session you are looking at reminds immediately.',
      'select.interval': 'Repeat interval',
      'select.max': 'At most',
      'combine.10': '10 seconds',
      'combine.20': '20 seconds',
      'combine.30': '30 seconds',
      'interval.15': '15 seconds',
      'interval.30': '30 seconds',
      'interval.60': '60 seconds',
      'max.2': '2 reminders',
      'max.3': '3 reminders',
      'max.5': '5 reminders',
      'action.test': 'Test the reminder',
      'action.test.desc': 'Plays the chime once and raises one desktop notification.',
      'probe.pending': 'Testing: chime played, waiting for the system to confirm the notification…',
      'probe.shown': 'Notification created and accepted by the system. If you still cannot see it, check the system notification settings or Do Not Disturb.',
      'probe.unconfirmed': 'Notification created, but the system never reported it as shown — usually notification settings or Do Not Disturb.',
      'probe.failed': 'The system rejected this notification.',
      'probe.threw': 'The browser threw while creating this notification. See the console for details.',
      'probe.permission': 'The browser has not granted desktop notifications yet. Use “Allow desktop notifications” above.',
      'probe.unsupported': 'This environment has no desktop notification support, so only the chime is available.',
      'probe.disabled': 'The desktop notification switch is off.',
      'probe.toggleOff': 'Note: desktop notifications are switched off, so real reminders only play the chime.',
      'action.permission': 'Allow desktop notifications',
      'permission.granted': 'Desktop notifications: allowed',
      'permission.default': 'Desktop notifications: not allowed yet',
      'permission.denied': 'Desktop notifications: blocked by the browser. Allow them in the site settings, then reload.',
      'permission.unsupported': 'This environment has no desktop notification support, so only the chime is available.',
      'banner.background': 'Reminders come from this page: keep the DSH tab open in the background — closing the page stops them.',
      'recent.title': 'Recent reminders',
      'recent.empty': 'No reminders yet.',
      'recent.hint': 'Kept in this page only — refreshing or closing the page clears the list.',
      'recent.audioOnly': 'sound only',
      'kind.done': 'Finished',
      'kind.awaiting': 'Waiting for you',
      'kind.error': 'Failed',
      'notify.done.title': 'Session finished',
      'notify.done.body': '“{name}” just finished — come take a look.',
      'notify.awaiting.title': 'Session is waiting for you',
      'notify.awaiting.body': '“{name}” stopped and needs your answer or approval.',
      'notify.error.title': 'Session failed',
      'notify.error.body': '“{name}” ran into an error — come take a look.',
      'notify.test.title': 'This is a test reminder',
      'notify.test.body': 'If you can see this notification and hear the chime, reminders work.',
      'session.unknown': 'New session',
      'footer.version': 'Version {version}',
    };
    //#endregion

    //#region settings
    /**
     * Stored-document version, written with every save. Nothing reads it yet: the key
     * was introduced with the current defaults, so no older document can exist. It is
     * here so a future default change can migrate instead of guessing.
     */
    const SETTINGS_VERSION = 1;

    /** Merge-window choices, in milliseconds. */
    const COMBINE_CHOICES = [10000, 20000, 30000];
    /** Repeat-interval choices, in milliseconds. */
    const INTERVAL_CHOICES = [15000, 30000, 60000];
    /** Reminder-count choices for one repeat chain. */
    const MAX_CHOICES = [2, 3, 5];

    /** Default preferences; a stored value only overrides a key of the same type. */
    const DEFAULTS = Object.freeze({
      enabled: true,
      desktop: true,
      sound: true,
      awaiting: true,
      errors: true,
      whenFocused: true,
      combineMs: 10000,
      repeat: true,
      repeatIntervalMs: 30000,
      repeatMax: 3,
    });

    let settings = readSettings();
    const settingsListeners = new Set();

    /** @returns whether `value` is one of the allowed choices. */
    function isChoice(value, choices) {
      return choices.indexOf(value) !== -1;
    }

    /** @returns stored preferences merged over the defaults, migrated and sanitized. */
    function readSettings() {
      const next = Object.assign({}, DEFAULTS);
      try {
        const raw = window.localStorage.getItem(SETTINGS_KEY);
        if (raw === null) return next;
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object') return next;
        for (const key of Object.keys(DEFAULTS)) {
          if (typeof parsed[key] === typeof DEFAULTS[key]) next[key] = parsed[key];
        }
      } catch (_storageUnavailable) {
        // A blocked or corrupt store simply falls back to the defaults.
      }
      // A hand-edited or outdated document may hold a value no control offers.
      if (!isChoice(next.combineMs, COMBINE_CHOICES)) next.combineMs = DEFAULTS.combineMs;
      if (!isChoice(next.repeatIntervalMs, INTERVAL_CHOICES)) next.repeatIntervalMs = DEFAULTS.repeatIntervalMs;
      if (!isChoice(next.repeatMax, MAX_CHOICES)) next.repeatMax = DEFAULTS.repeatMax;
      return next;
    }

    /** @param patch - partial preferences to persist and publish. */
    function updateSettings(patch) {
      settings = Object.assign({}, settings, patch);
      try {
        window.localStorage.setItem(
          SETTINGS_KEY,
          JSON.stringify(Object.assign({ v: SETTINGS_VERSION }, settings)),
        );
      } catch (_storageUnavailable) {
        // Keep the in-memory value; only cross-reload persistence is lost.
      }
      for (const listener of [...settingsListeners]) {
        try {
          listener();
        } catch (error) {
          console.error('[session-notifier] settings listener failed', error);
        }
      }
    }

    /** @returns the live preferences, re-rendering the caller on every change. */
    function useSettings() {
      const [, bump] = React.useReducer((count) => count + 1, 0);
      React.useEffect(() => {
        settingsListeners.add(bump);
        return () => {
          settingsListeners.delete(bump);
        };
      }, []);
      return settings;
    }
    //#endregion

    //#region runtime state
    const state = {
      /** Sessions observed running on this page; only a true → false edge reminds. */
      running: new Set(),
      /** Session ids the Host reported as subagent work. */
      subagents: new Set(),
      /** `sessionId → { timer, kind }` waiting for the merge window to close. */
      pendingEnd: new Map(),
      /** `sessionId → { timer, attempt, kind }` of the repeat chain. */
      repeats: new Map(),
      /** Sessions whose composed status currently carries a pending interaction. */
      awaiting: new Set(),
      /** Newest-first reminder log for the panel. */
      recent: [],
      recentListeners: new Set(),
      /** Timers owned by one notification or tone, cleared with the plugin. */
      timers: new Set(),
      /** Wall-clock time of the last tone, so two reminders do not overlap. */
      lastToneAt: 0,
    };

    /**
     * Run a callback later, keeping its timer id in the owned set.
     * @param callback - work to run once.
     * @param delay - delay in milliseconds.
     * @returns the timer id.
     */
    function startTimer(callback, delay) {
      const id = window.setTimeout(() => {
        state.timers.delete(id);
        callback();
      }, delay);
      state.timers.add(id);
      return id;
    }

    /** Drop every timer this plugin started. */
    function clearTimers() {
      for (const id of state.timers) window.clearTimeout(id);
      state.timers.clear();
    }

    /** Faces assigned when they become available; every consumer tolerates absence. */
    const services = {
      sessions: null,
      uiSession: null,
      ctx: null,
    };

    /** @returns the shipped Session list store, or undefined when unavailable. */
    function sessionList() {
      return listOf(services.sessions);
    }

    /** @returns the list store carried by one sessions service, when it has one. */
    function listOf(sessions) {
      const list = sessions === undefined || sessions === null ? undefined : sessions.list;
      return list !== undefined && list !== null && typeof list.getSnapshot === 'function' ? list : undefined;
    }

    /**
     * @param name - service key.
     * @returns the service instance, or undefined when this profile lacks it.
     */
    function readService(name) {
      const ctx = services.ctx;
      if (ctx === null || typeof ctx.get !== 'function') return undefined;
      try {
        return ctx.get(name);
      } catch (_missing) {
        return undefined;
      }
    }

    /** @returns the list row for one session, or undefined when it has none. */
    function sessionRow(sessionId) {
      const list = sessionList();
      if (list === undefined) return undefined;
      let snapshot;
      try {
        snapshot = list.getSnapshot();
      } catch (_unavailable) {
        return undefined;
      }
      const byId = snapshot === null || snapshot === undefined ? undefined : snapshot.byId;
      if (byId === undefined || byId === null) return undefined;
      const row = byId[sessionId];
      return row === undefined || row === null ? undefined : row;
    }

    /** @returns whether this session is subagent work rather than a session of your own. */
    function isSubagent(sessionId) {
      if (state.subagents.has(sessionId)) return true;
      const row = sessionRow(sessionId);
      return row !== undefined && row.origin === 'subagent';
    }

    /** @returns the session's display title, or an empty string while unknown. */
    function sessionTitle(sessionId) {
      const row = sessionRow(sessionId);
      if (row === undefined) return '';
      if (typeof row.displayTitle === 'string' && row.displayTitle !== '') return row.displayTitle;
      if (typeof row.title === 'string') return row.title;
      return '';
    }

    /** @returns whether a reminder is wanted for this session at all. */
    function eligible(sessionId) {
      if (!settings.enabled) return false;
      return !isSubagent(sessionId);
    }

    /** @returns whether the user is looking somewhere other than this page. */
    function pageIsAway() {
      if (typeof document === 'undefined') return true;
      if (document.visibilityState === 'hidden') return true;
      if (typeof document.hasFocus === 'function') return !document.hasFocus();
      return false;
    }
    //#endregion

    //#region chime
    let audio = null;

    /** @returns the page's AudioContext, created on first use. */
    function audioContext() {
      if (audio !== null) return audio;
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (Ctor === undefined) return null;
      try {
        audio = new Ctor();
      } catch (_unavailable) {
        audio = null;
      }
      return audio;
    }

    /** Resume the context from a user gesture so a later reminder may play. */
    function primeAudio() {
      const context = audioContext();
      if (context === null) return;
      if (context.state === 'suspended' && typeof context.resume === 'function') {
        context.resume().catch(() => {});
      }
    }

    /**
     * Play the reminder tone for one kind of event.
     * @param kind - `done`, `awaiting`, `error`, or `test`.
     */
    function chime(kind, force) {
      if (!settings.sound) return;
      const at = Date.now();
      if (force !== true) {
        if (at - state.lastToneAt < TONE_GAP_MS) return;
        state.lastToneAt = at;
      }
      const context = audioContext();
      if (context === null) return;
      if (context.state === 'suspended' && typeof context.resume === 'function') {
        context.resume().catch(() => {});
      }
      const start = context.currentTime + 0.02;
      const master = context.createGain();
      master.gain.value = 0.55;
      master.connect(context.destination);
      // A rising pair reads as "finished"; a triple alternation reads as "answer me";
      // a falling pair reads as "something went wrong".
      const notes =
        kind === 'awaiting'
          ? [
              [740, 0, 0.15],
              [988, 0.17, 0.15],
              [740, 0.34, 0.2],
            ]
          : kind === 'error'
            ? [
                [392, 0, 0.2],
                [294, 0.22, 0.34],
              ]
            : [
                [784, 0, 0.16],
                [1046.5, 0.18, 0.32],
              ];
      for (const [frequency, offset, duration] of notes) {
        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        oscillator.type = kind === 'done' || kind === 'test' ? 'sine' : 'triangle';
        oscillator.frequency.setValueAtTime(frequency, start + offset);
        envelope.gain.setValueAtTime(0.0001, start + offset);
        envelope.gain.exponentialRampToValueAtTime(0.6, start + offset + 0.015);
        envelope.gain.exponentialRampToValueAtTime(0.0001, start + offset + duration);
        oscillator.connect(envelope);
        envelope.connect(master);
        oscillator.start(start + offset);
        oscillator.stop(start + offset + duration + 0.03);
      }
      startTimer(() => {
        try {
          master.disconnect();
        } catch (_disconnected) {
          // The graph is already gone.
        }
      }, 1600);
    }
    //#endregion

    //#region desktop notification
    /** @returns `granted`, `default`, `denied`, or `unsupported`. */
    function permissionState() {
      if (typeof Notification === 'undefined') return 'unsupported';
      try {
        return Notification.permission;
      } catch (_unavailable) {
        return 'unsupported';
      }
    }

    /** @returns the resulting permission state after the browser prompt. */
    function requestPermission() {
      if (typeof Notification === 'undefined') return Promise.resolve('unsupported');
      try {
        if (Notification.permission !== 'default') return Promise.resolve(Notification.permission);
        return Promise.resolve(Notification.requestPermission()).catch(() => permissionState());
      } catch (_unavailable) {
        return Promise.resolve('unsupported');
      }
    }

    /**
     * Create one desktop notification and report why it exists or not.
     *
     * The tag is unique per reminder on purpose: Chromium replaces a notification
     * that shares an existing tag **without re-alerting**, so a single fixed tag
     * made every reminder after the first a silent swap of a stale toast — the
     * defect behind "permission is granted but nothing appears".
     * @param kind - reminder kind, which selects the copy and the urgency.
     * @param sessionId - session the notification points at.
     * @param onSettled - receives `shown`, `failed`, or `unconfirmed` once known.
     * @returns `{ created, reason }` where `reason` names the first blocking gate.
     */
    function notifyDesktop(kind, sessionId, onSettled, force) {
      if (!settings.desktop && force !== true) return { created: false, reason: 'disabled' };
      if (typeof Notification === 'undefined') return { created: false, reason: 'unsupported' };
      if (permissionState() !== 'granted') return { created: false, reason: 'permission' };
      const name = sessionTitle(sessionId) || fallbackName(sessionId);
      const copy = notificationCopy(kind, name);
      let notification;
      try {
        notification = new Notification(copy.title, {
          body: copy.body,
          tag: NOTIFICATION_TAG + ':' + Date.now() + ':' + (notificationSeq += 1),
          silent: true,
          renotify: true,
          requireInteraction: kind === 'awaiting',
        });
      } catch (error) {
        console.error('[session-notifier] could not create a notification', error);
        return { created: false, reason: 'threw' };
      }
      let settled = false;
      const settle = (outcome) => {
        if (settled) return;
        settled = true;
        if (typeof onSettled === 'function') onSettled(outcome);
      };
      notification.onshow = () => settle('shown');
      notification.onerror = () => settle('failed');
      notification.onclick = () => {
        try {
          window.focus();
        } catch (_unavailable) {
          // The window may refuse focus; opening the session still helps.
        }
        // Clicking is the acknowledgement, whether or not the focus event fires.
        acknowledge();
        openSession(sessionId);
        try {
          notification.close();
        } catch (_closed) {
          // Already gone.
        }
      };
      startTimer(() => settle('unconfirmed'), 2500);
      startTimer(() => {
        try {
          notification.close();
        } catch (_closed) {
          // Already gone.
        }
      }, 30000);
      return { created: true, reason: 'created' };
    }

    /**
     * @param kind - reminder kind.
     * @param name - display name of the session.
     * @returns the localized title and body for a desktop notification.
     */
    function notificationCopy(kind, name) {
      const t = currentTranslate();
      if (kind === 'awaiting') {
        return { title: t('notify.awaiting.title'), body: t('notify.awaiting.body', { name }) };
      }
      if (kind === 'error') {
        return { title: t('notify.error.title'), body: t('notify.error.body', { name }) };
      }
      if (kind === 'test') {
        return { title: t('notify.test.title'), body: t('notify.test.body') };
      }
      return { title: t('notify.done.title'), body: t('notify.done.body', { name }) };
    }

    /** @param sessionId - session to open in the main column. */
    function openSession(sessionId) {
      if (sessionId === undefined || sessionId === null || sessionId === '') return;
      const workspace = readService('uiWorkspace');
      if (workspace === undefined || workspace === null) return;
      if (typeof workspace.openSession !== 'function') return;
      try {
        workspace.openSession(sessionId);
      } catch (error) {
        console.error('[session-notifier] could not open the session', error);
      }
    }
    //#endregion

    //#region reminder engine
    let translate = null;

    /** @returns the translator bound to this plugin's namespace. */
    function currentTranslate() {
      if (translate !== null) return translate;
      const ctx = services.ctx;
      if (ctx !== null && ctx.locale !== undefined && typeof ctx.locale.bind === 'function') {
        try {
          translate = ctx.locale.bind(NS);
        } catch (_unavailable) {
          translate = null;
        }
      }
      return translate !== null ? translate : (key) => en[key] !== undefined ? en[key] : key;
    }

    /** @param sessionId - session identity. @returns a short stand-in title. */
    function fallbackName(sessionId) {
      const t = currentTranslate();
      const id = String(sessionId === undefined || sessionId === null ? '' : sessionId);
      if (id === '') return t('session.unknown');
      return id.length <= 8 ? id : id.slice(0, 8);
    }

    /** @param entry - one reminder to append to the panel log. */
    function pushRecent(entry) {
      state.recent.unshift(entry);
      if (state.recent.length > RECENT_LIMIT) state.recent.length = RECENT_LIMIT;
      for (const listener of [...state.recentListeners]) {
        try {
          listener();
        } catch (error) {
          console.error('[session-notifier] recent listener failed', error);
        }
      }
    }

    /** @returns the reminder log, re-rendering the caller on every change. */
    function useRecentReminders() {
      const [, bump] = React.useReducer((count) => count + 1, 0);
      React.useEffect(() => {
        state.recentListeners.add(bump);
        return () => {
          state.recentListeners.delete(bump);
        };
      }, []);
      return state.recent;
    }

    /**
     * Outcome of the last "test the reminder" probe. The browser's own answer is
     * the only way to tell a disabled toggle, a missing permission, a throw, and an
     * OS that swallowed the toast apart from one another.
     */
    const probeState = { status: 'idle' };
    const probeListeners = new Set();

    /** @param next - partial probe result to publish to the panel. */
    function publishProbe(next) {
      Object.assign(probeState, next);
      for (const listener of [...probeListeners]) {
        try {
          listener();
        } catch (error) {
          console.error('[session-notifier] probe listener failed', error);
        }
      }
    }

    /** @returns the last probe result, re-rendering the caller on change. */
    function useProbe() {
      const [, bump] = React.useReducer((count) => count + 1, 0);
      React.useEffect(() => {
        probeListeners.add(bump);
        return () => {
          probeListeners.delete(bump);
        };
      }, []);
      return probeState;
    }

    /**
     * Play the chime and raise one real notification whatever the desktop toggle
     * says, then report how far it got.
     */
    function runTestReminder() {
      primeAudio();
      chime('test', true);
      publishProbe({ status: 'pending' });
      const delivery = notifyDesktop(
        'test',
        '',
        (outcome) => publishProbe({ status: outcome }),
        true,
      );
      if (!delivery.created) publishProbe({ status: delivery.reason });
    }

    /**
     * Deliver one reminder: chime plus notification, then arm the repeat chain while
     * the page stays in the background.
     * @param kind - `done`, `awaiting`, or `error`.
     * @param sessionId - session the reminder belongs to.
     * @param attempt - 1-based reminder number of this chain.
     */
    function deliver(kind, sessionId, attempt) {
      if (!pageIsAway() && !settings.whenFocused) return;
      chime(kind);
      const delivery = notifyDesktop(kind, sessionId);
      pushRecent({
        name: sessionTitle(sessionId) || fallbackName(sessionId),
        kind,
        attempt,
        desktop: delivery.created,
        at: Date.now(),
      });
      if (!settings.repeat || attempt >= settings.repeatMax) return;
      if (!pageIsAway()) return;
      // A chain already armed for this session would keep its own timer, and its
      // callback would delete this newer record.
      cancelRepeat(sessionId);
      const timer = window.setTimeout(() => {
        state.repeats.delete(sessionId);
        if (!pageIsAway()) return;
        if (!eligible(sessionId)) return;
        deliver(kind, sessionId, attempt + 1);
      }, Math.max(5000, settings.repeatIntervalMs));
      state.repeats.set(sessionId, { timer, attempt, kind });
    }

    /** Stop every repeat chain: the user is back, so further reminders are noise. */
    function acknowledge() {
      if (state.repeats.size === 0) return;
      for (const record of state.repeats.values()) window.clearTimeout(record.timer);
      state.repeats.clear();
    }

    /** Drop one session's repeat chain only. */
    function cancelRepeat(sessionId) {
      const record = state.repeats.get(sessionId);
      if (record === undefined) return;
      window.clearTimeout(record.timer);
      state.repeats.delete(sessionId);
    }

    /**
     * Arm a reminder once the merge window closes, folding a burst of stops into one.
     * @param sessionId - session that stopped.
     * @param kind - reminder kind to deliver.
     */
    function scheduleEnd(sessionId, kind) {
      const previous = state.pendingEnd.get(sessionId);
      // A failed turn reports its error and then its idle edge, so an armed error
      // outranks the finish that follows it. Otherwise every failure would be
      // announced as an ordinary completion.
      const effective = previous !== undefined && previous.kind === 'error' ? 'error' : kind;
      if (previous !== undefined) window.clearTimeout(previous.timer);
      const timer = window.setTimeout(() => {
        state.pendingEnd.delete(sessionId);
        if (!eligible(sessionId)) return;
        deliver(effective, sessionId, 1);
      }, mergeWindowFor(sessionId));
      state.pendingEnd.set(sessionId, { timer, kind: effective });
    }

    /**
     * @param sessionId - session that stopped.
     * @returns the wait before reminding. The configured window absorbs a burst, but
     *   the user watching that very session would feel it as a delay, so that one
     *   case settles almost immediately.
     */
    function mergeWindowFor(sessionId) {
      const configured = Math.max(0, Number(settings.combineMs) || 0);
      if (pageIsAway() || !settings.whenFocused) return configured;
      return isViewingSession(sessionId) ? Math.min(VIEWING_MERGE_MS, configured) : configured;
    }

    /**
     * @param sessionId - session identity.
     * @returns whether the main view holds this session open. It is the same retain
     *   counter the shipped Session UI reads to pick its current session. A Harness
     *   without that source reports zero, which only costs the short window.
     */
    function isViewingSession(sessionId) {
      const sessions = services.sessions;
      if (sessions === null || typeof sessions.retainInfo !== 'function') return false;
      try {
        const info = sessions.retainInfo(sessionId).getSnapshot();
        return (info?.retainedBy?.mainView ?? 0) > 0;
      } catch (_unavailable) {
        return false;
      }
    }

    /** Cancel a pending end reminder for one session. */
    function cancelPendingEnd(sessionId) {
      const pending = state.pendingEnd.get(sessionId);
      if (pending === undefined) return;
      window.clearTimeout(pending.timer);
      state.pendingEnd.delete(sessionId);
    }

    /** Drop every armed timer; used on teardown and on a connection generation change. */
    function cancelAll() {
      for (const pending of state.pendingEnd.values()) window.clearTimeout(pending.timer);
      state.pendingEnd.clear();
      acknowledge();
    }

    /**
     * Apply one forwarded `api-session/status` edge.
     * @param sessionId - session whose agent changed state.
     * @param running - the new running state.
     */
    function onRunning(sessionId, running) {
      if (running) {
        state.running.add(sessionId);
        cancelPendingEnd(sessionId);
        cancelRepeat(sessionId);
        return;
      }
      // Only an edge we saw the start of is a session ending: an agent that is
      // merely reported idle (a fresh blank session, a page reconnect) is not.
      if (!state.running.delete(sessionId)) return;
      if (!eligible(sessionId)) return;
      scheduleEnd(sessionId, 'done');
    }

    /** Remember which sessions are subagent work, from the forwarded catalog rows. */
    function onSessionAdded(summary) {
      if (summary === null || typeof summary !== 'object') return;
      const id = summary.sessionId;
      if (id === undefined || id === null) return;
      const key = String(id);
      const parent = summary.parentSessionId;
      if (summary.origin === 'subagent' || (parent !== undefined && parent !== null)) state.subagents.add(key);
      else state.subagents.delete(key);
    }

    /**
     * Record sessions the catalog already reports as running. A page that loads or
     * reconnects mid-run would otherwise miss the `running` edge and swallow the
     * next `idle` one; the catalog row supplies the missing baseline.
     */
    function seedBaseline() {
      const list = sessionList();
      if (list === undefined) return;
      let snapshot;
      try {
        snapshot = list.getSnapshot();
      } catch (_unavailable) {
        return;
      }
      const byId = snapshot === null || snapshot === undefined ? undefined : snapshot.byId;
      if (byId === undefined || byId === null) return;
      for (const id of Object.keys(byId)) {
        const row = byId[id];
        if (row === undefined || row === null) continue;
        const key = String(row.sessionId !== undefined && row.sessionId !== null ? row.sessionId : id);
        if (row.running === true) state.running.add(key);
        if (row.origin === 'subagent') state.subagents.add(key);
      }
    }

    /** Fold the shipped Session UI status into "waiting for you" reminders. */
    function onStatusSnapshot() {
      const uiSession = services.uiSession;
      if (uiSession === undefined || uiSession === null) return;
      const source = uiSession.sessionStatus;
      if (source === undefined || source === null || typeof source.getSnapshot !== 'function') return;
      let snapshot;
      try {
        snapshot = source.getSnapshot();
      } catch (_unavailable) {
        return;
      }
      if (snapshot === undefined || snapshot === null || typeof snapshot.forEach !== 'function') return;
      const now = new Set();
      snapshot.forEach((status, sessionId) => {
        if (status === null || status === undefined) return;
        if (status.pendingInteraction !== undefined && status.pendingInteraction !== null) now.add(String(sessionId));
      });
      for (const sessionId of now) {
        if (state.awaiting.has(sessionId)) continue;
        state.awaiting.add(sessionId);
        if (!settings.awaiting) continue;
        if (!eligible(sessionId)) continue;
        // A pending interaction supersedes the end reminder already armed for this
        // session: the agent is blocked, not finished.
        cancelPendingEnd(sessionId);
        deliver('awaiting', sessionId, 1);
      }
      for (const sessionId of [...state.awaiting]) if (!now.has(sessionId)) state.awaiting.delete(sessionId);
    }
    //#endregion

    //#region panel
    /** @returns the localized option label for a merge-window length in ms. */
    function combineLabel(ms) {
      const t = currentTranslate();
      return t('combine.' + Math.round(ms / 1000));
    }

    /** @returns the localized option label for a repeat interval in ms. */
    function intervalLabel(ms) {
      const t = currentTranslate();
      return t('interval.' + Math.round(ms / 1000));
    }

    /**
     * Render one preference row.
     * @param props - key, localized copy, an optional status line, and the control on the right.
     * @returns the row element.
     */
    function Row(props) {
      const t = currentTranslate();
      return h(
        'div',
        { className: 'sen-row' },
        h(
          'div',
          { className: 'sen-row-text' },
          h('div', { className: 'sen-row-title' }, t(props.titleKey)),
          props.descriptionKey === undefined ? null : h('div', { className: 'sen-row-desc' }, t(props.descriptionKey)),
          props.note === undefined ? null : h('div', { className: 'sen-row-note' }, props.note),
        ),
        h('div', { className: 'sen-row-control' }, props.children),
      );
    }

    /**
     * Render one group of preference rows under the small heading the host's own
     * settings pages use, with an optional note under the heading.
     * @param props - heading key, optional note key, and the rows.
     * @returns the section element.
     */
    function Section(props) {
      const t = currentTranslate();
      return h(
        'section',
        { className: 'sen-section', 'aria-label': t(props.titleKey) },
        h('h2', { className: 'sen-section-title' }, t(props.titleKey)),
        props.noteKey === undefined ? null : h('p', { className: 'sen-section-note' }, t(props.noteKey)),
        props.children,
      );
    }

    /**
     * Render one boolean preference as the host's own switch control: a
     * `role="switch"` button carrying `aria-checked`, with the 16 px thumb that
     * translates 16 px when on. The copied geometry and colors are the shipped
     * switch primitive's, so the row reads as native.
     * @param props - the `settings` key this control owns and its row title key.
     * @returns the switch element.
     */
    function Switch(props) {
      const current = useSettings();
      const checked = Boolean(current[props.settingsKey]);
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          className: 'sen-switch',
          'aria-checked': checked ? 'true' : 'false',
          'aria-label': currentTranslate()(props.titleKey),
          onClick: () => {
            const patch = {};
            patch[props.settingsKey] = !checked;
            updateSettings(patch);
            primeAudio();
          },
        },
        h('span', { className: 'sen-switch-thumb', 'aria-hidden': 'true' }),
      );
    }

    /**
     * Render one enumerated preference as the host's pill selector: a native
     * `select` with the primitive's geometry plus the chevron the shipped
     * permission row draws.
     * @param props - `settings` key, numeric choices, and the label function.
     * @returns the select element.
     */
    function Choice(props) {
      const current = useSettings();
      return h(
        'span',
        { className: 'sen-select-wrap' },
        h(
          'select',
          {
            className: 'sen-select',
            value: String(current[props.settingsKey]),
            'aria-label': currentTranslate()(props.titleKey),
            onChange: (event) => {
              const patch = {};
              patch[props.settingsKey] = Number(event.target.value);
              updateSettings(patch);
            },
          },
          props.choices.map((value) => h('option', { key: String(value), value: String(value) }, props.label(value))),
        ),
        h(
          'svg',
          {
            className: 'sen-select-chevron',
            width: 12,
            height: 12,
            viewBox: '0 0 12 12',
            fill: 'none',
            'aria-hidden': 'true',
            focusable: 'false',
          },
          h('path', {
            d: 'M2.75 4.5 6 7.75 9.25 4.5',
            stroke: 'currentColor',
            strokeWidth: 1.4,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          }),
        ),
      );
    }

    /** @returns the current desktop-notification permission, refreshed on mount and focus. */
    function usePermission() {
      const [permission, setPermission] = React.useState(() => permissionState());
      React.useEffect(() => {
        const refresh = () => setPermission(permissionState());
        refresh();
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => {
          window.removeEventListener('focus', refresh);
          document.removeEventListener('visibilitychange', refresh);
        };
      }, []);
      return [permission, setPermission];
    }

    /**
     * Render the reminder preferences page under the sidebar entry.
     * @returns the page element.
     */
    function NotifierPage() {
      const t = currentTranslate();
      const current = useSettings();
      const recent = useRecentReminders();
      const probe = useProbe();
      const [permission, setPermission] = usePermission();
      const permissionText =
        permission === 'granted'
          ? t('permission.granted')
          : permission === 'denied'
            ? t('permission.denied')
            : permission === 'unsupported'
              ? t('permission.unsupported')
              : t('permission.default');
      return h(
        'section',
        { className: 'sen-page', 'aria-label': t('panel.title') },
        h(
          'div',
          { className: 'sen-scroll' },
          h(
            'div',
            { className: 'sen-content' },
            h(
              'header',
              { className: 'sen-head' },
              h('h1', { className: 'sen-title' }, t('panel.title')),
              h('p', { className: 'sen-desc' }, t('panel.desc')),
            ),

            h('div', { className: 'sen-banner' }, h('span', { className: 'sen-banner-dot', 'aria-hidden': 'true' }), h('span', null, t('banner.background'))),

            h(
              Section,
              { titleKey: 'group.master' },
              h(
                Row,
                { titleKey: 'switch.enabled', descriptionKey: 'switch.enabled.desc' },
                h(Switch, { settingsKey: 'enabled', titleKey: 'switch.enabled' }),
              ),
            ),

            h(
              Section,
              { titleKey: 'group.methods' },
              h(
                Row,
                {
                  titleKey: 'switch.desktop',
                  descriptionKey: 'switch.desktop.desc',
                  note: permissionText,
                },
                permission === 'default'
                  ? h(
                      'button',
                      {
                        type: 'button',
                        className: 'sen-btn',
                        onClick: () => {
                          requestPermission().then((next) => setPermission(next));
                        },
                      },
                      t('action.permission'),
                    )
                  : null,
                h(Switch, { settingsKey: 'desktop', titleKey: 'switch.desktop' }),
              ),
              h(
                Row,
                { titleKey: 'switch.sound', descriptionKey: 'switch.sound.desc' },
                h(Switch, { settingsKey: 'sound', titleKey: 'switch.sound' }),
              ),
            ),

            h(
              Section,
              { titleKey: 'group.events' },
              h(
                Row,
                { titleKey: 'switch.awaiting', descriptionKey: 'switch.awaiting.desc' },
                h(Switch, { settingsKey: 'awaiting', titleKey: 'switch.awaiting' }),
              ),
              h(
                Row,
                { titleKey: 'switch.errors', descriptionKey: 'switch.errors.desc' },
                h(Switch, { settingsKey: 'errors', titleKey: 'switch.errors' }),
              ),
              h(
                Row,
                { titleKey: 'switch.focused', descriptionKey: 'switch.focused.desc' },
                h(Switch, { settingsKey: 'whenFocused', titleKey: 'switch.focused' }),
              ),
              h(
                Row,
                { titleKey: 'select.combine', descriptionKey: 'select.combine.desc' },
                h(Choice, {
                  settingsKey: 'combineMs',
                  titleKey: 'select.combine',
                  choices: COMBINE_CHOICES,
                  label: combineLabel,
                }),
              ),
            ),

            h(
              Section,
              { titleKey: 'group.repeat' },
              h(
                Row,
                { titleKey: 'switch.repeat', descriptionKey: 'switch.repeat.desc' },
                h(Switch, { settingsKey: 'repeat', titleKey: 'switch.repeat' }),
              ),
              h(
                Row,
                { titleKey: 'select.interval' },
                h(Choice, {
                  settingsKey: 'repeatIntervalMs',
                  titleKey: 'select.interval',
                  choices: INTERVAL_CHOICES,
                  label: intervalLabel,
                }),
              ),
              h(
                Row,
                { titleKey: 'select.max' },
                h(Choice, {
                  settingsKey: 'repeatMax',
                  titleKey: 'select.max',
                  choices: MAX_CHOICES,
                  label: (value) => t('max.' + value),
                }),
              ),
            ),

            h(
              'div',
              { className: 'sen-actions' },
              h(
                'div',
                { className: 'sen-row-text' },
                h('div', { className: 'sen-row-title' }, t('action.test')),
                h(
                  'div',
                  { className: probe.status === 'idle' ? 'sen-row-desc' : 'sen-row-desc sen-probe' },
                  probe.status === 'idle' ? t('action.test.desc') : t('probe.' + probe.status),
                ),
                current.desktop ? null : h('div', { className: 'sen-row-desc' }, t('probe.toggleOff')),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'sen-btn sen-btn-primary',
                  onClick: () => {
                    runTestReminder();
                  },
                },
                t('action.test'),
              ),
            ),

            h(
              Section,
              { titleKey: 'recent.title', noteKey: 'recent.hint' },
              recent.length === 0
                ? h('p', { className: 'sen-empty' }, t('recent.empty'))
                : h('ul', { className: 'sen-recent' },
                    recent.map((entry, index) =>
                      h(
                        'li',
                        { className: 'sen-recent-row', key: String(entry.at) + ':' + index },
                        h(
                          'span',
                          { className: 'sen-recent-name' },
                          entry.name === '' ? t('session.unknown') : entry.name,
                        ),
                        h(
                          'span',
                          { className: 'sen-recent-meta' },
                          h('span', { className: 'sen-kind sen-kind-' + entry.kind }, t('kind.' + entry.kind)),
                          entry.desktop === false
                            ? h('span', { className: 'sen-recent-flag' }, t('recent.audioOnly'))
                            : null,
                          h('span', { className: 'sen-recent-time' }, formatTime(entry.at)),
                          entry.attempt > 1 ? h('span', { className: 'sen-recent-time' }, '#' + entry.attempt) : null,
                        ),
                      ),
                    ),
                  ),
            ),

            h('p', { className: 'sen-version' }, t('footer.version', { version: PLUGIN_VERSION })),
          ),
        ),
      );
    }

    /** @returns the local wall-clock time of one reminder. */
    function formatTime(at) {
      try {
        return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } catch (_unavailable) {
        return '';
      }
    }

    /**
     * Render the left sidebar entry: a bell, matching the host panel rows by
     * inheriting the row's text color and requested edge.
     * @param props - the sidebar's icon share: `size` in pixels and `active`.
     * @returns the bell glyph.
     */
    function BellIcon(props) {
      const edge = typeof props.size === 'number' && props.size > 0 ? props.size : 16;
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: edge,
          height: edge,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          focusable: 'false',
          style: { display: 'block' },
        },
        h('path', {
          d: 'M12 3.4a5.7 5.7 0 0 0-5.7 5.7v3.2c0 .62-.19 1.22-.55 1.72l-1.2 1.68c-.53.74-.03 1.76.86 1.76h13.18c.9 0 1.39-1.02.86-1.76l-1.2-1.68a2.85 2.85 0 0 1-.55-1.72V9.1A5.7 5.7 0 0 0 12 3.4Z',
        }),
        h('path', { d: 'M9.6 19.3a2.5 2.5 0 0 0 4.8 0' }),
      );
    }
    //#endregion

    //#region styles
    /**
     * Page styles. Every control copies the geometry, states, and `--dsw-alias-*`
     * tokens of the shipped primitive it replaces (switch, size-`sm` button, the
     * permission row's pill selector, and that row's hairline layout), so the page
     * reads as a native Harness settings surface. No Harness Client package is
     * imported: the rules are transcribed, not shared.
     */
    const CSS = [
      '.sen-page{height:100%;min-height:0;display:flex;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}',
      '.sen-scroll{flex:1 1 auto;min-height:0;overflow-y:auto}',
      '.sen-content{max-width:760px;margin:0 auto;padding:32px 32px 64px;display:flex;flex-direction:column;gap:28px}',
      '.sen-head{display:flex;flex-direction:column;gap:8px}',
      '.sen-title{margin:0;font-size:20px;line-height:28px;font-weight:500;color:var(--dsw-alias-label-primary)}',
      '.sen-desc{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}',
      '.sen-banner{display:flex;align-items:flex-start;gap:8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.sen-banner-dot{flex:none;width:6px;height:6px;margin-top:6px;border-radius:50%;corner-shape:round;background:var(--dsw-alias-state-success-primary)}',
      '.sen-section{display:flex;flex-direction:column}',
      '.sen-section-title{margin:0;font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-tertiary)}',
      '.sen-section-note{margin:2px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.sen-row{border-bottom:.5px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:16px 0;display:flex}',
      '.sen-row-text{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:32px;display:flex}',
      '.sen-row-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}',
      '.sen-row-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}',
      '.sen-row-note{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}',
      '.sen-row-control{flex:none;display:flex;align-items:center;gap:8px}',
      '.sen-switch{box-sizing:border-box;position:relative;flex:0 0 auto;width:36px;height:20px;padding:2px;border:0;border-radius:999px;corner-shape:round;background:var(--dsw-alias-border-l3);cursor:pointer}',
      '.sen-switch[aria-checked=true]{background:var(--dsw-alias-brand-primary)}',
      '.sen-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.sen-switch-thumb{display:block;width:16px;height:16px;border-radius:50%;corner-shape:round;background:var(--dsw-alias-label-primary-foreground);transition:transform .12s ease}',
      '.sen-switch[aria-checked=false] .sen-switch-thumb{background:var(--dsw-alias-switch-thumb)}',
      '.sen-switch[aria-checked=true] .sen-switch-thumb{transform:translate(16px)}',
      '@media (prefers-reduced-motion:reduce){.sen-switch-thumb{transition:none}}',
      '.sen-select-wrap{position:relative;display:inline-flex;align-items:center}',
      '.sen-select{box-sizing:border-box;appearance:none;-webkit-appearance:none;height:36px;padding:0 32px 0 14px;border:0;border-radius:12px;corner-shape:round;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:14px;line-height:22px;cursor:pointer}',
      '.sen-select:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.sen-select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.sen-select-chevron{position:absolute;right:12px;color:var(--dsw-alias-label-tertiary);pointer-events:none}',
      '.sen-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:36px;padding:0 14px;border:none;border-radius:12px;corner-shape:round;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:14px;line-height:22px;cursor:pointer;white-space:nowrap}',
      '.sen-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.sen-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.sen-btn-primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}',
      '.sen-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}',
      '.sen-actions{display:flex;align-items:center;gap:8px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}',
      '.sen-empty{margin:16px 0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}',
      '.sen-version{margin:8px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.sen-recent{list-style:none;margin:0;padding:0}',
      '.sen-recent-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:.5px solid var(--dsw-alias-border-l2);font-size:13px;line-height:20px}',
      '.sen-recent-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}',
      '.sen-recent-meta{flex:none;display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-tertiary)}',
      '.sen-kind{display:inline-flex;align-items:center;padding:1px 8px;border-radius:999px;corner-shape:round;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:17px;font-weight:500}',
      '.sen-kind-done{color:var(--dsw-alias-state-success-primary)}',
      '.sen-kind-awaiting{color:var(--dsw-alias-state-warn-primary)}',
      '.sen-kind-error{color:var(--dsw-alias-state-error-primary)}',
      '.sen-recent-time{font-variant-numeric:tabular-nums}',
      '.sen-probe{color:var(--dsw-alias-state-warn-primary)}',
      '.sen-recent-flag{color:var(--dsw-alias-state-warn-primary);font-size:11px;line-height:18px}',
    ].join('\n');
    //#endregion

    /**
     * Client plugin body: register copy, the reminder feed, the stylesheet, and the
     * sidebar entry plus its preferences page.
     * @param ctx - Client root context.
     */
    function apply(ctx) {
      services.ctx = ctx;

      /** Hard requirements only; the Session services are resolved when present. */
      const t = ctx.locale.bind(NS);

      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-notifier: dictionaries');

      ctx.effect(() => {
        const element = document.createElement('style');
        element.setAttribute('data-dsh-plugin', NS);
        element.textContent = CSS;
        document.head.appendChild(element);
        return () => {
          element.remove();
        };
      }, 'session-notifier: stylesheet');

      ctx.effect(
        () => () => {
          cancelAll();
          clearTimers();
        },
        'session-notifier: timers',
      );

      // Cross-tab preference edits (another window changed a switch).
      ctx.effect(() => {
        const onStorage = (event) => {
          if (event.key !== null && event.key !== SETTINGS_KEY) return;
          settings = readSettings();
          for (const listener of [...settingsListeners]) {
            try {
              listener();
            } catch (error) {
              console.error('[session-notifier] settings listener failed', error);
            }
          }
        };
        window.addEventListener('storage', onStorage);
        return () => {
          window.removeEventListener('storage', onStorage);
        };
      }, 'session-notifier: cross-tab settings');

      // Autoplay policy: the first gesture in the page unlocks the chime.
      ctx.effect(() => {
        const unlock = () => primeAudio();
        window.addEventListener('pointerdown', unlock, { capture: true, once: true });
        window.addEventListener('keydown', unlock, { capture: true, once: true });
        return () => {
          window.removeEventListener('pointerdown', unlock, true);
          window.removeEventListener('keydown', unlock, true);
        };
      }, 'session-notifier: audio unlock');

      // Coming back to the page ends every repeat chain.
      ctx.effect(() => {
        const back = () => acknowledge();
        window.addEventListener('focus', back);
        window.addEventListener('pointerdown', back, true);
        document.addEventListener('visibilitychange', back);
        return () => {
          window.removeEventListener('focus', back);
          window.removeEventListener('pointerdown', back, true);
          document.removeEventListener('visibilitychange', back);
        };
      }, 'session-notifier: acknowledgement');

      ctx.effect(() => {
        const offStatus = ctx.remote.$on('api-session/status', (sessionId, running) => {
          onRunning(String(sessionId), Boolean(running));
        });
        const offAdded = ctx.remote.$on('api-session/added', (summary) => {
          onSessionAdded(summary);
        });
        const offError = ctx.remote.$on('api-session/error', (sessionId) => {
          const id = String(sessionId);
          if (!settings.errors) return;
          if (!eligible(id)) return;
          scheduleEnd(id, 'error');
        });
        const offRemoved = ctx.remote.$on('api-session/removed', (sessionId) => {
          const id = String(sessionId);
          state.running.delete(id);
          state.awaiting.delete(id);
          state.subagents.delete(id);
          cancelPendingEnd(id);
          cancelRepeat(id);
        });
        return () => {
          offStatus();
          offAdded();
          offError();
          offRemoved();
        };
      }, 'session-notifier: session feed');

      // Baseline for a page that loads or reconnects while a session already runs.
      ctx.inject(['sessions'], (scope) => {
        services.sessions = scope.sessions;
        scope.effect(() => {
          const list = listOf(scope.sessions);
          if (list === undefined) return () => {};
          const off = list.subscribe(() => seedBaseline());
          seedBaseline();
          return off;
        }, 'session-notifier: running baseline');
      });

      // A new connection generation re-reports state; never let a stale baseline
      // turn into a "finished" reminder.
      ctx.on('connection/reset', () => {
        state.running.clear();
        state.awaiting.clear();
        cancelAll();
      });

      // The composed "waiting for you" fact, from the shipped Session UI status.
      ctx.inject(['uiSession'], (scope) => {
        services.uiSession = scope.uiSession;
        scope.effect(() => {
          const source = services.uiSession === null || services.uiSession === undefined ? undefined : services.uiSession.sessionStatus;
          if (source === undefined || source === null || typeof source.subscribe !== 'function') return () => {};
          const off = source.subscribe(() => onStatusSnapshot());
          onStatusSnapshot();
          return off;
        }, 'session-notifier: pending interactions');
      });

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 20,
            locale: NS,
            label: () => t('panel.label'),
          },
          BellIcon,
        ),
      );

      ctx.slots.inject('main', () =>
        ctx.slots.register(
          {
            name: 'main',
            key: PANEL_ID,
            locale: NS,
          },
          NotifierPage,
        ),
      );
    }

    return {
      inject: ['slots', 'locale', 'remote'],
      apply,
    };
  },
});
