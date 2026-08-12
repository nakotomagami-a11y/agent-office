import { Skeleton } from "@/components/ui/skeleton";

export default function OfficeLoading() {
  return (
    <>
      <div className="flex items-center gap-[10px] px-[18px] py-[10px] border-b border-line bg-bg-1">
        <Skeleton width={140} height={20} />
        <span className="ml-2">
          <Skeleton width={180} height={12} />
        </span>
      </div>
      <div className="office p-6">
        <Skeleton width={420} height={480} />
      </div>
    </>
  );
}
