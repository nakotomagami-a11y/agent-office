/**
 * API module for composer attachments — multipart upload to an agent/project
 * uploads endpoint, plus reading a pasted image off the Wayland clipboard in
 * the Tauri shell.
 *
 * `target` is a prebuilt uploads URL from `API_ROUTES.projectUploads` /
 * `API_ROUTES.agentUploads` so the caller picks the right scope.
 */

import { API_ROUTES } from "@agent-office/domain/config/routes";
import { apiClient } from "@/lib/api-client";

export interface UploadedAttachment {
  filename: string;
  path: string;
  size: number;
}

export async function uploadAttachment(target: string, file: File): Promise<UploadedAttachment> {
  const form = new FormData();
  form.append("file", file);
  // Clear the instance's default JSON content-type so the browser sets the
  // multipart boundary for the FormData body.
  const res = await apiClient.post<UploadedAttachment>(target, form, {
    headers: { "Content-Type": undefined },
  });
  return res.data;
}

export async function fetchClipboardImage(): Promise<Blob> {
  const res = await apiClient.post<Blob>(API_ROUTES.clipboardImage, undefined, {
    responseType: "blob",
  });
  return res.data;
}
