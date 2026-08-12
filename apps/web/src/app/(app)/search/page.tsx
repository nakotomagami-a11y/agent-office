import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { SearchView } from "@/modules/search/components/search-view";
import { Skeleton } from "@/components/ui/skeleton";

export default async function SearchPage() {
  const t = await getTranslations();
  return (
    <>
      <div className="flex items-center gap-[10px] px-[18px] py-[10px] border-b border-line bg-bg-1">
        <h1 className="m-0 text-[16px] font-bold tracking-[-0.01em]">{t("search_page.title")}</h1>
      </div>
      <Suspense
        fallback={
          <div className="p-6 flex flex-col gap-1.5">
            <Skeleton width="100%" height={36} />
            <div className="h-2" />
            <Skeleton width="100%" height={48} />
            <div className="h-1" />
            <Skeleton width="100%" height={48} />
            <div className="h-1" />
            <Skeleton width="100%" height={48} />
          </div>
        }
      >
        <SearchView />
      </Suspense>
    </>
  );
}
