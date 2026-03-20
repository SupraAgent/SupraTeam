"use client";

import * as React from "react";
import { getGravatarUrl, getInitials, getAvatarColor } from "@/lib/email/avatar";

type ContactAvatarProps = {
  email: string;
  name?: string;
  size?: number;
  className?: string;
};

export function ContactAvatar({ email, name, size = 28, className }: ContactAvatarProps) {
  const [imgError, setImgError] = React.useState(false);
  const gravatarUrl = React.useMemo(() => getGravatarUrl(email, size * 2), [email, size]);
  const initials = getInitials(name || email);
  const bgColor = getAvatarColor(email);

  return (
    <div
      className={`rounded-full flex items-center justify-center shrink-0 overflow-hidden ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        backgroundColor: bgColor,
      }}
    >
      {!imgError ? (
        <img
          src={gravatarUrl}
          alt=""
          width={size}
          height={size}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      ) : (
        <span
          className="font-bold text-white/90"
          style={{ fontSize: size * 0.38 }}
        >
          {initials}
        </span>
      )}
    </div>
  );
}
