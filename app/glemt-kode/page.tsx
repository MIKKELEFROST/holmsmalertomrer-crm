import { AuthShell } from "@/components/auth-shell";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Glemt adgangskode — Holms CRM" };

export default function ForgotPage() {
  return (
    <AuthShell>
      <ForgotForm />
    </AuthShell>
  );
}
