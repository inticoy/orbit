"use client";

/** iOS-style on/off switch. */
export function Switch({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: (next: boolean) => void }) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 active:opacity-70 disabled:opacity-40 ${checked ? "bg-[#34c759]" : "bg-app-ink/[.12]"}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span className={`absolute top-[2px] left-[2px] size-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,.15),0_1px_1px_rgba(0,0,0,.16)] transition-transform duration-200 ${checked ? "translate-x-5" : ""}`} />
    </button>
  );
}
