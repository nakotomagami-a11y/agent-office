"use client";

import { cn } from "@/lib/cn";

export type UserAvatarProps = {
  /** Square size in CSS pixels. Defaults to 32. */
  size?: number;
  className?: string;
};

/**
 * The human user's fixed portrait in chat — mirrors {@link AgentAvatar}'s
 * shape, but there's only one image (no faction/kind selection) since it
 * always represents the same person.
 */
export function UserAvatar({ size = 32, className }: UserAvatarProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/avatars/user.png"
      width={size}
      height={size}
      className={cn("shrink-0 [image-rendering:pixelated] rounded object-cover", className)}
      style={{ width: size, height: size }}
      alt=""
      aria-hidden
    />
  );
}
