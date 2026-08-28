import { redirect } from "next/navigation";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";

// Analytics folded into Activity's "Insights" tab — see REDESIGN_V3_PLAN §D5.
export default function AnalyticsRoute() {
  redirect(`${PAGE_ROUTES.activity}?tab=insights`);
}
