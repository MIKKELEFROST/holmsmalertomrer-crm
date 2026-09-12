import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-archivo",
  display: "swap",
});

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Holms Maler & Tømrer — CRM",
  description: "Lead-CRM til Holms Maler & Tømrer ApS",
};

export const viewport: Viewport = {
  // Appen bruges primært i bilen; navy header skal gå op i statuslinjen.
  themeColor: "#072236",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="da" className={`${archivo.variable} ${plex.variable}`}>
      <body>{children}</body>
    </html>
  );
}
