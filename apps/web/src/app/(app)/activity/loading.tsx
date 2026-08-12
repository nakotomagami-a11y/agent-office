import { Skeleton } from "@/components/ui/skeleton";

export default function ActivityLoading() {
  return (
    <>
      <div className="flex items-center gap-[10px] px-[18px] py-[10px] border-b border-line bg-bg-1">
        <Skeleton width={120} height={20} />
      </div>
      <div className="overflow-auto py-[18px] px-6 flex flex-col gap-3">
        <Skeleton width="100%" height={56} />
        <Skeleton width="100%" height={56} />
        <Skeleton width="100%" height={56} />
        <Skeleton width="100%" height={56} />
      </div>
    </>
  );
}
