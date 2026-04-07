export default function AutomationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="-m-4 md:-m-6 h-[calc(100dvh-3.5rem)] md:h-dvh overflow-auto">
      {children}
    </div>
  );
}
