"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { IconTile, RowText } from "@/components/ui";
import { row } from "@/lib/design";

/** Settings row that signs this device out, after an action-sheet confirmation. */
export function LogoutRow() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`${row} w-full text-left transition-colors active:bg-app-fill`} onClick={() => setOpen(true)} type="button">
        <IconTile tone="danger"><LogOut aria-hidden="true" size={18} /></IconTile>
        <RowText title={<span className="text-app-danger">로그아웃</span>} />
      </button>
      <Sheet onClose={() => setOpen(false)} open={open} title="로그아웃">
        <p className="m-0 mb-5 text-[15px] text-app-muted">이 기기에서 로그아웃할까요? 다시 들어올 때는 Face ID로 로그인하면 돼요.</p>
        <div className="grid gap-2">
          <a
            className="grid h-[52px] place-items-center rounded-[16px] bg-app-danger text-[15px] font-semibold text-white no-underline active:scale-[.985]"
            href="/api/auth/logout"
          >로그아웃</a>
          <button className="h-[52px] rounded-[16px] bg-app-ink/[.05] text-[15px] font-semibold" onClick={() => setOpen(false)} type="button">취소</button>
        </div>
      </Sheet>
    </>
  );
}
