import Link from "next/link";
import { ChevronLeft, UserRound } from "lucide-react";
import { EngineChip } from "@/components/activity";
import { ListOrderToggle } from "@/components/list-order-toggle";
import { LogoutRow } from "@/components/logout-row";
import { NotAllowed } from "@/components/not-allowed";
import { PasskeySetup } from "@/components/passkey-setup";
import { PushToggle } from "@/components/push-toggle";
import { VaultLogins } from "@/components/vault-logins";
import { IconTile, RowText, SectionHeader } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { engineStatus } from "@/lib/conversations";
import { glassButton, row } from "@/lib/design";
import { getEnv } from "@/lib/env";
import { LIST_ORDER_COOKIE, listOrder } from "@/lib/list-order";
import { getVault } from "@/lib/vault";
import { cookies } from "next/headers";

export default async function SettingsPage() {
  const viewer = await getViewer();
  if (!viewer) return <NotAllowed />;
  const env = await getEnv();
  const [passkeys, engine, jar, vault] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM passkeys WHERE email = ?").bind(viewer.email).first<{ n: number }>(),
    engineStatus(env),
    cookies(),
    getVault(env),
  ]);

  return (
    <main className="min-h-dvh bg-app-bg pt-[calc(env(safe-area-inset-top)+12px)] pr-[max(12px,env(safe-area-inset-right))] pb-[calc(40px+env(safe-area-inset-bottom))] pl-[max(12px,env(safe-area-inset-left))]">
      <div className="mx-auto grid max-w-[520px] grid-cols-[minmax(0,1fr)] gap-0.5">
        <header className="flex items-center gap-2 px-2 pb-1">
          <Link aria-label="뒤로" className={glassButton} href="/"><ChevronLeft aria-hidden="true" size={22} /></Link>
          <h1 className="m-0 flex-1 text-[32px] font-bold tracking-[-0.03em]">설정</h1>
        </header>

        <SectionHeader id="engine">맥 엔진</SectionHeader>
        <section aria-labelledby="engine" className="px-2 py-1">
          <EngineChip lastSeen={engine.lastSeen} online={engine.online} />
          <p className="m-0 mt-2 text-[13px] leading-relaxed text-app-muted">위성은 내 맥에서 일해요. 맥이 꺼져 있으면 맡긴 일이 쌓였다가 켜지면 처리돼요.{engine.version ? ` 엔진 ${engine.version}` : ""}</p>
        </section>

        <SectionHeader id="vault">로그인 정보</SectionHeader>
        <section aria-labelledby="vault">
          <VaultLogins publicKey={vault.publicKey} sites={vault.sites} waiting={vault.waiting} />
        </section>
        <p className="m-0 px-2 pt-1 text-[12px] leading-relaxed text-app-muted">이 폰에서 암호화해서 맥 키체인에만 저장해요. 서버에는 남지 않아요. 위성이 로그인해야 할 때 꺼내 써요.</p>

        <SectionHeader id="list">목록</SectionHeader>
        <section aria-labelledby="list" className="grid gap-0.5">
          <ListOrderToggle order={listOrder(jar.get(LIST_ORDER_COOKIE)?.value)} />
        </section>

        <SectionHeader id="device">이 기기</SectionHeader>
        <section aria-labelledby="device" className="grid gap-0.5">
          {env.VAPID_PUBLIC_KEY ? <PushToggle publicKey={env.VAPID_PUBLIC_KEY} /> : null}
          <PasskeySetup count={passkeys?.n ?? 0} />
        </section>
        <p className="m-0 px-2 pt-1 text-[12px] leading-relaxed text-app-muted">열 때마다 로그인이 400일 연장돼요. 풀리면 Face ID 한 번이면 돼요.</p>

        <SectionHeader id="account">계정</SectionHeader>
        <section aria-labelledby="account" className="grid gap-0.5">
          <div className={row}>
            <IconTile><UserRound aria-hidden="true" size={19} /></IconTile>
            <RowText title={viewer.email} />
          </div>
          <LogoutRow />
        </section>
      </div>
    </main>
  );
}
