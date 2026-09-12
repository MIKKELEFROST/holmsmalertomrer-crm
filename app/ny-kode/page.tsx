import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { NewPasswordForm } from "./new-password-form";

export const metadata = { title: "Ny adgangskode — Holms CRM" };

export default function NewPasswordPage() {
  return (
    <AuthShell>
      <Suspense>
        <NewPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
