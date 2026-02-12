import { redirect } from "next/navigation";

// Root route — middleware handles redirect to /dashboard or /sign-in
// This is a fallback in case middleware doesn't catch it
export default function Home() {
  redirect("/dashboard");
}
