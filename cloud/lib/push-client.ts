import { savePushSubscription } from "@/app/actions";

function keyBytes(base64url: string) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4);
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

export async function getThisDeviceSubscription() {
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return registration.pushManager.getSubscription();
}

export async function subscribeThisDevice(publicKey: string) {
  // Request permission before awaiting anything else to preserve the iOS tap gesture.
  if (Notification.permission !== "granted" && await Notification.requestPermission() !== "granted") {
    throw new Error("알림 권한을 허용해 주세요.");
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await savePushSubscription(subscription.toJSON());
}
