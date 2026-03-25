"use client";

import * as React from "react";
import { ChatFlow } from "./_components/chat-flow";

export default function ApplyPage() {
  return (
    <React.Suspense fallback={null}>
      <ChatFlow />
    </React.Suspense>
  );
}
