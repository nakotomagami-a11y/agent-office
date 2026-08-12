"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import type { FlutterDevice } from "@/app/api/flutter/devices/route";

export type { FlutterDevice };

export type FlutterDevicesResponse = {
  available: boolean;
  devices: FlutterDevice[];
};

export function useFlutterDevices(enabled = true) {
  return useQuery({
    queryKey: ["flutter-devices"],
    queryFn: () => apiFetch<FlutterDevicesResponse>("/api/flutter/devices"),
    refetchInterval: enabled ? 5000 : false,
    enabled,
  });
}
