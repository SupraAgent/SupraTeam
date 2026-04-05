"use client";

import * as React from "react";
import { Download, Copy, Check } from "lucide-react";

interface QrDisplayProps {
  url: string;
  size?: number;
  className?: string;
  showDownload?: boolean;
}

/**
 * Client-side QR code display component.
 * Fetches QR SVG from the server and renders it inline.
 * Includes SupraCRM branding overlay and optional download buttons.
 */
export function QrDisplay({ url, size = 200, className, showDownload = true }: QrDisplayProps) {
  const [svg, setSvg] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    // Generate QR client-side by calling a dynamic import of the lib
    // We render the SVG inline to avoid an extra API call
    let cancelled = false;

    import("@/lib/qr-svg").then(({ generateQrSvg }) => {
      if (!cancelled) {
        setSvg(generateQrSvg(url, size, true));
      }
    });

    return () => { cancelled = true; };
  }, [url, size]);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: noop
    }
  };

  const handleDownloadSvg = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "qr-code.svg";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleDownloadPng = () => {
    if (!svg) return;

    const canvas = document.createElement("canvas");
    const pngSize = size * 2; // 2x for retina
    canvas.width = pngSize;
    canvas.height = pngSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    const svgBlob = new Blob([svg], { type: "image/svg+xml" });
    const svgUrl = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.drawImage(img, 0, 0, pngSize, pngSize);
      URL.revokeObjectURL(svgUrl);

      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = "qr-code.png";
      a.click();
    };

    img.src = svgUrl;
  };

  if (!svg) {
    return (
      <div
        className={`flex items-center justify-center bg-white/5 rounded-lg ${className ?? ""}`}
        style={{ width: size, height: size }}
      >
        <div className="h-5 w-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={`inline-flex flex-col items-center gap-3 ${className ?? ""}`}>
      <div
        ref={containerRef}
        className="rounded-lg overflow-hidden bg-white p-2"
        dangerouslySetInnerHTML={{ __html: svg }}
      />

      {showDownload && (
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadSvg}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-white/5 hover:bg-white/10 text-muted-foreground transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            SVG
          </button>
          <button
            onClick={handleDownloadPng}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-white/5 hover:bg-white/10 text-muted-foreground transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            PNG
          </button>
          <button
            onClick={handleCopyUrl}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-white/5 hover:bg-white/10 text-muted-foreground transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "URL"}
          </button>
        </div>
      )}
    </div>
  );
}
