import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log ind — Holms CRM" };

export default function LoginPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "var(--color-navy)",
      }}
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
