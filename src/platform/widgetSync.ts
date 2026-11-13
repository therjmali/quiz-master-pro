/**
 * Android Home Screen Widget Synchronization & Pinning Bridge for Quiz Master Pro.
 *
 * Keeps Android AppWidgets (Daily Practice, Subject Mastery, Exam Countdown, Quick Quiz)
 * updated with live stats and enables native one-tap widget pinning to the Android launcher.
 */

import { registerPlugin } from '@capacitor/core';

export interface ActiveSubjectWidgetData {
  id: string;
  name: string;
  shortName: string;
  icon?: string;
  color?: string;
  percent: number;
  solvedQuestions: number;
  totalQuestions: number;
  activeUnitName?: string;
}

export interface ExamWidgetData {
  title: string;
  date: string;
  daysRemaining: number;
  targetPace?: string;
}

export interface WidgetStats {
  todayQuestions: number;
  targetQuestions: number;
  streakDays: number;
  masteryPercent: number;
  todayMinutes?: number;
  todayTopics?: number;
  targetTopics?: number;
  syllabusPercent?: number;
  activeTimer?: boolean;
  timerDisplay?: string;
  timerStatus?: string;
  activeSubject?: ActiveSubjectWidgetData;
  examTarget?: ExamWidgetData;
}

export type WidgetType = 'study' | 'focus' | 'subject' | 'exam';

interface NativeWidgetBridge {
  updateWidgetData?: (json: string) => void;
  isPinWidgetSupported?: () => boolean;
  requestPinWidget?: (widgetType: string) => boolean;
  consumePendingWidgetAction?: () => string | null;
}

export interface WidgetIntentAction {
  action: 'quick-quiz' | 'open-subject' | 'open-exam' | string;
  subject?: string | null;
}

interface QmNativePluginType {
  pinShortcut(options: { icon: string; label?: string }): Promise<{ supported: boolean; pinned: boolean }>;
  updateWidgetData(options: { data: string }): Promise<{ success: boolean }>;
  isPinWidgetSupported(): Promise<{ supported: boolean }>;
  requestPinWidget(options: { type: string }): Promise<{ pinned: boolean }>;
}

const QmNative = registerPlugin<QmNativePluginType>('QmNative');

const getBridge = (): NativeWidgetBridge | undefined => {
  const win = window as unknown as { RJNative?: NativeWidgetBridge; QmNative?: NativeWidgetBridge };
  return win.RJNative || win.QmNative;
};

/** Check if the Android launcher supports pinning widgets programmatically (Android 8.0+ / API 26+) */
export async function isPinWidgetSupportedAsync(): Promise<boolean> {
  try {
    const bridge = getBridge();
    if (bridge?.isPinWidgetSupported) {
      return Boolean(bridge.isPinWidgetSupported());
    }
    const res = await QmNative.isPinWidgetSupported();
    return Boolean(res?.supported);
  } catch {
    return false;
  }
}

export function isPinWidgetSupported(): boolean {
  try {
    const bridge = getBridge();
    return bridge?.isPinWidgetSupported ? Boolean(bridge.isPinWidgetSupported()) : false;
  } catch {
    return false;
  }
}

/** Request pinning a widget to the Android Home Screen */
export async function requestPinWidgetAsync(widgetType: WidgetType): Promise<boolean> {
  try {
    const bridge = getBridge();
    if (bridge?.requestPinWidget) {
      return Boolean(bridge.requestPinWidget(widgetType));
    }
    const res = await QmNative.requestPinWidget({ type: widgetType });
    return Boolean(res?.pinned);
  } catch {
    return false;
  }
}

export function requestPinWidget(widgetType: WidgetType): boolean {
  try {
    const bridge = getBridge();
    if (bridge?.requestPinWidget) {
      return Boolean(bridge.requestPinWidget(widgetType));
    }
    QmNative.requestPinWidget({ type: widgetType }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/** Sync latest stats to the Android Native AppWidgets */
export function updateNativeWidgets(stats: WidgetStats): void {
  try {
    const payload = JSON.stringify({
      ...stats,
      todayTopics: stats.todayQuestions,
      targetTopics: stats.targetQuestions,
      syllabusPercent: stats.masteryPercent,
      updatedAt: Date.now(),
    });

    const bridge = getBridge();
    if (bridge?.updateWidgetData) {
      bridge.updateWidgetData(payload);
    } else {
      QmNative.updateWidgetData({ data: payload }).catch(() => {});
    }
  } catch {
    // best-effort
  }
}

/** Listen for home screen widget taps (both cold start and warm resume). */
export function subscribeWidgetActions(handler: (evt: WidgetIntentAction) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const win = window as unknown as {
    __qmWidgetAction?: (payload: WidgetIntentAction | string) => void;
  };

  const dispatch = (raw: WidgetIntentAction | string | null | undefined) => {
    if (!raw) return;
    try {
      const parsed: WidgetIntentAction = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed.action === 'string') {
        handler(parsed);
      }
    } catch {
      // ignore malformed payload
    }
  };

  win.__qmWidgetAction = (payload) => {
    try { getBridge()?.consumePendingWidgetAction?.(); } catch {}
    dispatch(payload);
  };

  try {
    const pending = getBridge()?.consumePendingWidgetAction?.();
    if (pending) dispatch(pending);
  } catch {
    // ignore
  }

  return () => {
    if (win.__qmWidgetAction) delete win.__qmWidgetAction;
  };
}
