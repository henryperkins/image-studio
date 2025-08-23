import React from "react";
export interface TabItem {
  id: string;
  label: string;
  ariaControls?: string;
}
 
interface TabsProps {
  tabs: TabItem[];
  selected: string;
  onChange: (id: string) => void;
  idPrefix?: string;
  listClassName?: string;
  getTabClassName?: (id: string, selected: boolean) => string;
}
 
export default function Tabs({
  tabs,
  selected,
  onChange,
  idPrefix = "",
  listClassName,
  getTabClassName,
}: TabsProps) {
  const onKeyDown = (e: React.KeyboardEvent, idx: number) => {
    const lastIdx = tabs.length - 1;
    const go = (i: number) => {
      const id = tabs[i].id;
      onChange(id);
      setTimeout(() => document.getElementById(`${idPrefix}tab-${id}`)?.focus(), 0);
    };
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      go(idx > 0 ? idx - 1 : lastIdx);
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      go(idx < lastIdx ? idx + 1 : 0);
    } else if (e.key === "Home") {
      e.preventDefault();
      go(0);
    } else if (e.key === "End") {
      e.preventDefault();
      go(lastIdx);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      go(idx);
    }
  };
 
  return (
    <div
      className={listClassName}
      role="tablist"
      aria-label="Tabs"
    >
      {tabs.map((t, idx) => {
        const isSelected = t.id === selected;
        const className =
          getTabClassName?.(t.id, isSelected) ||
          `px-3 py-1.5 text-sm ${isSelected ? "bg-neutral-700" : "bg-neutral-900 hover:bg-neutral-800"} focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:z-10`;
        return (
          <button
            key={t.id}
            id={`${idPrefix}tab-${t.id}`}
            role="tab"
            aria-selected={isSelected}
            aria-controls={t.ariaControls || `${idPrefix}panel-${t.id}`}
            tabIndex={isSelected ? 0 : -1}
            className={className}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, idx)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
