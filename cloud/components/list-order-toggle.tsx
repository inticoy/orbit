"use client";

import { useState, useTransition } from "react";
import { ListOrdered } from "lucide-react";
import { setListOrder } from "@/app/actions";
import { IconTile, RowText } from "@/components/ui";
import type { ListOrder } from "@/lib/list-order";
import { row } from "@/lib/design";

const OPTIONS: [ListOrder, string][] = [["recent", "최근 대화 순"], ["fixed", "고정 순서"]];

/** Settings row: how the satellite list is ordered, as an iOS-style segmented control. */
export function ListOrderToggle({ order }: { order: ListOrder }) {
  const [value, setValue] = useState(order);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-1 pb-1">
      <div className={row}>
        <IconTile><ListOrdered aria-hidden="true" size={19} /></IconTile>
        <RowText title="위성 순서" detail={value === "recent" ? "마지막 대화가 최근인 위성이 위로 와요" : "설정 파일에 적은 순서 그대로예요"} />
      </div>
      <div aria-label="위성 순서" className="mx-2 grid grid-cols-2 rounded-[9px] bg-app-fill p-0.5" role="radiogroup">
        {OPTIONS.map(([key, label]) => (
          <button
            aria-checked={value === key}
            className={`rounded-[7px] px-3 py-1.5 text-[13px] font-semibold transition-colors disabled:opacity-60 ${value === key ? "bg-app-card text-app-ink shadow-card" : "text-app-muted"}`}
            disabled={pending}
            key={key}
            onClick={() => {
              setValue(key);
              start(() => setListOrder(key));
            }}
            role="radio"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
