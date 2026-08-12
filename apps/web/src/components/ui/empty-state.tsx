import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export type EmptyStateProps = {
  icon?: IconName;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-3 text-center text-txt-2 py-[48px] px-6">
      {icon ? (
        <div aria-hidden className="bg-bg-2 flex items-center justify-center text-txt-3 w-12 h-12 rounded-[12px]">
          <Icon name={icon} size={22} />
        </div>
      ) : null}
      <div className="font-semibold text-txt text-[14px]">{title}</div>
      {description ? <div className="text-[12.5px] max-w-[360px]">{description}</div> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
