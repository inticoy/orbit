import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getViewer } from "@/lib/auth";
import { getEnv } from "@/lib/env";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const params = await searchParams;
  const next = typeof params.next === "string" && params.next.startsWith("/") && !params.next.startsWith("//") ? params.next : "/";
  if (await getViewer()) redirect(next);
  return <LoginForm code={typeof params.code === "string" ? params.code : ""} next={next} publicKey={(await getEnv()).VAPID_PUBLIC_KEY ?? ""} />;
}
