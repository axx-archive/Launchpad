import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "spark — sign in",
  description: "Sign in to your Spark project portal.",
};

export default function SignInLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
