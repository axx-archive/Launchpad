import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "launchpad — sign in",
  description: "Sign in to your Launchpad project portal.",
};

export default function SignInLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
