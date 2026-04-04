"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DripRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/outreach");
  }, [router]);
  return null;
}
