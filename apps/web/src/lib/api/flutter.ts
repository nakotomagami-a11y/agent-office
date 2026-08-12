/**
 * API module for the Flutter device manager — run lifecycle and live mirror,
 * exposed under `/api/flutter/*`. Device polling and screenshots live in their
 * own hook / <img> src and are not routed through here.
 */

import { API_ROUTES } from "@agent-office/domain/config/routes";
import { apiClient } from "@/lib/api-client";

export interface FlutterRunTarget {
  projectId?: string;
  customPath?: string;
}

export interface FlutterRunStatus {
  pid: number | null;
  alive: boolean;
}

export async function getFlutterRunStatus(target: FlutterRunTarget): Promise<FlutterRunStatus> {
  const res = await apiClient.get<FlutterRunStatus>(API_ROUTES.flutterRun, { params: target });
  return res.data;
}

export async function startFlutterRun(
  body: FlutterRunTarget & { deviceId: string },
): Promise<{ pid?: number; error?: string }> {
  const res = await apiClient.post<{ pid?: number; error?: string }>(API_ROUTES.flutterRun, body);
  return res.data;
}

export async function stopFlutterRun(target: FlutterRunTarget): Promise<void> {
  await apiClient.delete(API_ROUTES.flutterRun, { params: target });
}

export async function launchFlutterMirror(deviceId: string | null): Promise<void> {
  await apiClient.post(API_ROUTES.flutterMirror, { deviceId });
}
