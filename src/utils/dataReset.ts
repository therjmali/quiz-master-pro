/**
 * Complete local-data reset.
 *
 * "Clear Local Data" used to wipe only ONE of the history stores and left the
 * IndexedDB cache, quiz-detail copies, folder tree, trash, bookmarks and the
 * sync marker behind — so everything came straight back after reload.
 *
 * This wipes every place the app persists data on this device:
 *   - all localStorage keys the app owns (qmp_*, idb_* fallbacks, rjquiz:*)
 *   - the whole IndexedDB key-value store (history, caches, details, tree, trash…)
 *   - every in-memory cache (history store, folder tree, folder trash)
 *
 * Cloud data is NOT touched. Signed-in users get their cloud history back on the
 * next load — that is by design (the cloud is the source of truth); use Trash to
 * delete cloud quizzes.
 */
import { ALL_APP_KEYS } from './backupUtils';
import { idbClearAll, idbDelete, idbDeleteByPrefix, idbSet } from './indexedDB';
import { clearHistoryStore } from './historyStore';
import { resetFileTreeCaches } from './fileTree';

const OWNED_PREFIXES = ['qmp_', 'idb_', 'rjquiz:'];

/**
 * Personal preferences and credentials. "Clear Local Data" is about DATA (history,
 * folders, bookmarks, caches) — it must not silently destroy the user's API keys,
 * theme or settings, so these survive unless a full fresh-restore replaces them.
 */
const PREFERENCE_KEYS = new Set<string>([
  'qmp_api_keys', 'qmp_theme', 'qmp_accent_hsl', 'qmp_accent_hex', 'qmp_font_size',
  'qmp_glass_intensity', 'qmp_settings', 'qmp_ai_prefs', 'qmp_rationale_prefs',
  'qmp_haptics', 'qmp_quiz_skins', 'qmp_quiz_skin', 'qmp_preferred_email',
  'qmp_onboarding_done', 'qmp_gestures_seen', 'qmp_install_dismissed',
  'qmp_profile', 'rjquiz:profile', 'qmp_exam_dates', 'qmp_notes_config',
  'qmp_weekly_email', 'qmp_study_reminders', 'qmp_user_subjects',
]);

export async function wipeAllLocalStores(opts: { keepPreferences?: boolean } = {}): Promise<void> {
  const keepPreferences = opts.keepPreferences ?? false;
  // 1) In-memory caches first, so nothing can write stale data back mid-reset
  try { await clearHistoryStore(); } catch {}
  try { resetFileTreeCaches(); } catch {}

  // 2) IndexedDB (history, history cache, sync marker, details, tree, trash, bookmarks, mistakes…)
  await idbClearAll();

  // 3) localStorage — everything the app owns
  try {
    const toRemove = new Set<string>(ALL_APP_KEYS);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && OWNED_PREFIXES.some(p => k.startsWith(p))) toRemove.add(k);
    }
    toRemove.forEach(k => { if (!(keepPreferences && PREFERENCE_KEYS.has(k))) localStorage.removeItem(k); });
  } catch {}
}

/** Full reset used by the "Clear Local Data" buttons. Sets the flags that stop auto-restore. */
export async function clearAllLocalData(): Promise<void> {
  await wipeAllLocalStores({ keepPreferences: true });
  try {
    localStorage.setItem('qmp_drive_linked', 'false');
    localStorage.setItem('qmp_clear_pending', 'true');
  } catch {}
}

/** localStorage key → the IndexedDB copies that must be cleared together with it. */
const IDB_COMPANIONS: Record<string, string[]> = {
  qmp_history: ['qmp_history_idb', 'qmp_history_cache', 'qmp_last_sync_ts'],
  qmp_file_tree: ['qmp_file_tree_idb'],
  qmp_file_trash: ['qmp_file_trash_idb'],
  qmp_bookmarks: ['qmp_bookmarks_idb'],
  qmp_bookmarks_v2: ['qmp_bookmarks_idb'],
  qmp_global_mistakes_v1: ['qmp_mistakes_idb'],
};

/**
 * Clear specific localStorage keys AND their IndexedDB companions / in-memory caches,
 * so a category clear really removes the data instead of leaving a hidden copy.
 */
export async function clearStorageKeys(keys: string[]): Promise<void> {
  for (const k of keys) {
    try { localStorage.removeItem(k); } catch {}
    for (const idbKey of IDB_COMPANIONS[k] || []) await idbDelete(idbKey);
    try { localStorage.removeItem(`idb_${k}`); } catch {}
  }
  if (keys.includes('qmp_history')) {
    await idbDeleteByPrefix('qmp_detail_');
    try { await clearHistoryStore(); } catch {}
  }
  if (keys.includes('qmp_file_tree') || keys.includes('qmp_file_trash')) resetFileTreeCaches();
}

/**
 * After a restore wrote localStorage values, mirror the IDB-primary stores so a stale
 * IndexedDB copy can never override the restored data on next load.
 */
export async function mirrorRestoredSettingsToIdb(settings: Record<string, string | undefined>): Promise<void> {
  const mirrors: Array<{ lsKey: string; idbKey: string }> = [
    { lsKey: 'qmp_file_tree', idbKey: 'qmp_file_tree_idb' },
    { lsKey: 'qmp_file_trash', idbKey: 'qmp_file_trash_idb' },
    { lsKey: 'qmp_bookmarks_v2', idbKey: 'qmp_bookmarks_idb' },
    { lsKey: 'qmp_global_mistakes_v1', idbKey: 'qmp_mistakes_idb' },
  ];
  for (const { lsKey, idbKey } of mirrors) {
    const val = settings[lsKey];
    if (val == null) continue;
    try { await idbSet(idbKey, JSON.parse(val)); } catch {}
  }
  resetFileTreeCaches();
}
