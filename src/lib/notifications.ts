import { LocalNotifications } from "@capacitor/local-notifications";
import { isNative } from "./native";

const NOTIFICATION_ID_BASE = 1000;
const TEST_NOTIFICATION_ID = 999;

export async function rescheduleNotifications(enabled: boolean, times: string[]): Promise<void> {
  if (!isNative()) return;
  await cancelAll();
  if (!enabled || times.length === 0) return;

  const { display } = await LocalNotifications.requestPermissions();
  if (display !== "granted") return;

  const notifications = times.map((time, i) => {
    const [hours, minutes] = time.split(":").map(Number);
    return {
      id: NOTIFICATION_ID_BASE + i,
      title: "🫧 탄단지버블",
      body: "오늘 식사 기록하셨어요? 버블을 채워보세요!",
      schedule: {
        on: { hour: hours, minute: minutes },
        repeats: true,
        allowWhileIdle: true,
      },
    };
  });

  await LocalNotifications.schedule({ notifications });
}

export async function cancelAll(): Promise<void> {
  if (!isNative()) return;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length > 0) {
    await LocalNotifications.cancel({ notifications: pending.notifications });
  }
}

export async function fireTestNotification(): Promise<void> {
  if (!isNative()) return;
  const { display } = await LocalNotifications.requestPermissions();
  if (display !== "granted") return;
  await LocalNotifications.schedule({
    notifications: [
      {
        id: TEST_NOTIFICATION_ID,
        title: "🫧 탄단지버블",
        body: "알림이 정상적으로 작동해요!",
        schedule: { at: new Date(Date.now() + 3000) },
      },
    ],
  });
}

export async function syncFromServer(
  fetchNotifications: () => Promise<{ times: string[]; enabled: boolean }>,
): Promise<void> {
  if (!isNative()) return;
  try {
    const { times, enabled } = await fetchNotifications();
    await rescheduleNotifications(enabled, times);
  } catch {
    // 미로그인 상태 등 — 무시
  }
}

export async function getPermissionStatus(): Promise<"granted" | "denied" | "prompt"> {
  if (!isNative()) return "granted";
  const { display } = await LocalNotifications.checkPermissions();
  // "prompt-with-rationale" (Android) → "prompt" 으로 통일
  return display === "granted" ? "granted" : display === "denied" ? "denied" : "prompt";
}
