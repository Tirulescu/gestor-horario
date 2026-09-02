"use client";

import { Reorder, useDragControls } from "motion/react";
import { DragHandle } from "@/components/DragHandle";
import type { SubjectStudent } from "./types";

export function MemberRow({ m, children, className }: {
  m: SubjectStudent;
  children: React.ReactNode;
  className?: string;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={m}
      layout
      dragListener={false}
      dragControls={controls}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      whileDrag={{ scale: 1.01, boxShadow: "0 12px 32px rgb(0 0 0 / 0.14)", zIndex: 20 }}
      className={className}
    >
      <div className="flex items-center gap-2 flex-wrap border border-gray-100 rounded-lg px-3 py-2 w-full">
        <DragHandle controls={controls} />
        {children}
      </div>
    </Reorder.Item>
  );
}
