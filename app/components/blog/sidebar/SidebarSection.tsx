import { useId, type ReactNode } from "react";

/** 사이드바 항목 한 칸(제목 + 내용) */
export function SidebarSection({
  type,
  title,
  children,
}: {
  type: string;
  title: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className={`sidebar-item sidebar-${type.toLowerCase()}`} aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}
