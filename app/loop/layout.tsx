import "@supra/loop-builder/styles.css";

export default function LoopBuilderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="h-full w-full overflow-hidden">{children}</div>;
}
