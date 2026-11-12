export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
      <div className="grid place-items-center min-h-screen bg-linear-to-tr from-muted/30 to-card/80 relative z-2">
        {children}
      </div>
  );
}
