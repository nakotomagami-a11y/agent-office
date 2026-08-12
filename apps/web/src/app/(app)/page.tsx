"use client";

import dynamic from "next/dynamic";

const OfficeView = dynamic(
  () => import("@/modules/office/components/office-view").then((m) => m.OfficeView),
  { ssr: false },
);

export default function OfficePage() {
  return <OfficeView />;
}
