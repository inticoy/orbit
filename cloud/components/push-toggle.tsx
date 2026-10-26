"use client";

import { useEffect, useState } from "react";
import { Bell, Send } from "lucide-react";
import { removePushSubscription, sendTestPush } from "@/app/actions";
import { Switch } from "@/components/switch";
import { IconTile, RowText } from "@/components/ui";
import { row } from "@/lib/design";
import { getThisDeviceSubscription, subscribeThisDevice } from "@/lib/push-client";

type State = "loading" | "unsupported" | "denied" | "off" | "on";

/** Settings rows: push notifications on/off for this device, and a test push. iOS allows push only in the home screen app. */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    getThisDeviceSubscription()
      .then((subscription) => setState(Notification.permission === "denied" ? "denied" : subscription ? "on" : "off"))
      .catch(() => setState("unsupported"));
  }, []);

  async function toggle(next: boolean) {
    setBusy(true);
    setNote("");
    try {
      if (next) {
        await subscribeThisDevice(publicKey);
        setState("on");
      } else {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await removePushSubscription(subscription.endpoint);
          await subscription.unsubscribe();
        }
        setState("off");
      }
    } catch {
      setState(Notification.permission === "denied" ? "denied" : next ? "off" : "on");
      setNote("바꾸지 못했어요. 다시 시도해 주세요.");
    }
    setBusy(false);
  }

  async function test() {
    setBusy(true);
    const sent = await sendTestPush().catch(() => 0);
    setNote(sent ? "보냈어요. 곧 알림이 와요." : "보내지 못했어요. 알림을 껐다 다시 켜 주세요.");
    setBusy(false);
  }

  const detail = {
    loading: "확인하는 중…",
    unsupported: "홈 화면에 추가한 Orbit에서 켤 수 있어요",
    denied: "iPhone 설정 → 알림 → Orbit에서 허용해 주세요",
    off: "위성이 일을 끝내면 이 기기로 알려 줘요",
    on: "이 기기로 알림을 받고 있어요",
  }[state];

  return (
    <>
      <div className={row}>
        <IconTile><Bell aria-hidden="true" size={19} /></IconTile>
        <RowText title="알림 받기" detail={note || detail} />
        <Switch checked={state === "on"} disabled={busy || state === "loading" || state === "unsupported" || state === "denied"} label="알림 받기" onChange={toggle} />
      </div>
      {state === "on" ? (
        <button className={`${row} w-full text-left transition-colors active:bg-app-fill disabled:opacity-50`} disabled={busy} onClick={test} type="button">
          <IconTile><Send aria-hidden="true" size={18} /></IconTile>
          <RowText title="테스트 알림 보내기" />
        </button>
      ) : null}
    </>
  );
}
