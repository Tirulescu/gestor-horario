export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="login-layout min-h-dvh flex items-center justify-center">
      {children}
    </div>
  );
}
