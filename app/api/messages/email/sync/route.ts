import { NextResponse, type NextRequest } from "next/server";
import { authorized } from "@/lib/api-auth";
import { syncMail } from "@/lib/imap";
import { serviceClient } from "@/lib/messages";

/**
 * Henter nye mails ind i korrespondancen.
 *
 * Kaldes udefra med jævne mellemrum — se docs/kommunikation.md. Postkassen
 * ligger på eget domæne uden push, så der er ikke andet at gøre end at spørge.
 *
 * Kald:
 *   POST /api/messages/email/sync
 *   Authorization: Bearer <MAIL_SYNC_SECRET>
 */

export const runtime = "nodejs";

// IMAP-forbindelse, op til 50 mails og lige så mange opslag i databasen.
// Standardgrænsen på 15 sekunder er for kort den dag der ligger en bunke.
// 60 er loftet på Hobby-planen; en højere værdi afvises ved deploy.
export const maxDuration = 60;

async function run(request: NextRequest) {
  if (!authorized(request, process.env.MAIL_SYNC_SECRET)) {
    return NextResponse.json({ error: "Ikke godkendt" }, { status: 401 });
  }

  try {
    const report = await syncMail(serviceClient());

    // Fejlede en mappe, skal kaldet fejle udadtil. Ellers står der 200 i
    // cron-loggen mens indbakken i virkeligheden ikke er blevet læst i en uge.
    const failed = report.mapper.filter((result) => result.fejl !== null);

    return NextResponse.json(
      {
        ok: failed.length === 0,
        ...report,
        gemt: report.mapper.reduce((sum, result) => sum + result.gemt, 0),
        udenMatch: report.mapper.reduce((sum, result) => sum + result.udenMatch, 0),
      },
      { status: failed.length === 0 ? 200 : 500 },
    );
  } catch (error) {
    const besked = error instanceof Error ? error.message : String(error);
    console.error("Mailsynkronisering fejlede:", besked);
    return NextResponse.json({ error: besked }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return run(request);
}

/**
 * GET gør det samme. Ikke af princip, men fordi de fleste cron-tjenester —
 * Vercel Cron iblandt — kun kan lave GET-kald.
 */
export async function GET(request: NextRequest) {
  return run(request);
}
