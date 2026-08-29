import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { SearchView } from "@/modules/search/components/search-view";

export default async function SearchPage() {
  const t = await getTranslations();
  return (
    <>
      <div className="flex items-center gap-[10px] px-[18px] py-[10px] border-b border-line bg-bg-1">
        <h1 className="m-0 text-[16px] font-bold tracking-[-0.01em]">{t("search_page.title")}</h1>
      </div>
      {/* Suspense boundary is required by `useSearchParams()` in SearchView,
          not a real loading window — fallback stays empty. */}
      <Suspense fallback={null}>
        <SearchView />
      </Suspense>
    </>
  );
}
