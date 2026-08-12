"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";

function isActive(pathname: string, href: string, exact = false): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="hidden max-[600px]:flex [&>*]:flex-1 [&>*]:basis-0 fixed bottom-0 left-0 right-0 z-50 border-t border-line bg-bg-0 pb-[env(safe-area-inset-bottom)]"
      aria-label="Mobile navigation"
    >
      <Link
        href={PAGE_ROUTES.office}
        aria-current={isActive(pathname, PAGE_ROUTES.office, true) ? "page" : undefined}
        className={cn(
          "flex flex-col items-center justify-center gap-0.5 h-16 text-[10px] text-txt-3",
          isActive(pathname, PAGE_ROUTES.office, true) && "text-acc",
        )}
      >
        <Icon name="home" size={20} />
        <span>Office</span>
      </Link>

      <Link
        href={PAGE_ROUTES.activity}
        aria-current={isActive(pathname, PAGE_ROUTES.activity) ? "page" : undefined}
        className={cn(
          "flex flex-col items-center justify-center gap-0.5 h-16 text-[10px] text-txt-3",
          isActive(pathname, PAGE_ROUTES.activity) && "text-acc",
        )}
      >
        <Icon name="activity" size={20} />
        <span>Activity</span>
      </Link>

      <div className="flex items-center justify-center h-16">
        <Link
          href={PAGE_ROUTES.agentNew}
          aria-label="Create new agent"
          className="w-12 h-12 rounded-full bg-acc text-acc-ink flex items-center justify-center shadow-2 -mt-5 mx-auto"
        >
          <Icon name="plus" size={22} />
        </Link>
      </div>

      <Link
        href={PAGE_ROUTES.agents}
        aria-current={isActive(pathname, PAGE_ROUTES.agents) ? "page" : undefined}
        className={cn(
          "flex flex-col items-center justify-center gap-0.5 h-16 text-[10px] text-txt-3",
          isActive(pathname, PAGE_ROUTES.agents) && "text-acc",
        )}
      >
        <Icon name="users" size={20} />
        <span>Agents</span>
      </Link>

      <Link
        href={PAGE_ROUTES.settings}
        aria-current={isActive(pathname, PAGE_ROUTES.settings) ? "page" : undefined}
        className={cn(
          "flex flex-col items-center justify-center gap-0.5 h-16 text-[10px] text-txt-3",
          isActive(pathname, PAGE_ROUTES.settings) && "text-acc",
        )}
      >
        <Icon name="settings" size={20} />
        <span>More</span>
      </Link>
    </nav>
  );
}
