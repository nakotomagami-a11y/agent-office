"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/fetch";
import type { FlutterDevice } from "@agent-office/domain/types";
import { API_ROUTES } from "@agent-office/api-contract";

export type { FlutterDevice };

export type FlutterDevicesResponse = {
  available: boolean;
  devices: FlutterDevice[];
};

export function useFlutterDevices(enabled = true) {
  return useQuery({
    queryKey: ["flutter-devices"],
    queryFn: () => apiFetch<FlutterDevicesResponse>(API_ROUTES.flutterDevices),
    refetchInterval: enabled ? 5000 : false,
    enabled,
  });
}
