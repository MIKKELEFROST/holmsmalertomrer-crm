/**
 * Test af samtale-oversigten.
 *
 * Kør: npm test
 *
 * To ting afgør om Beskeder-siden er brugbar: at nyeste samtale står øverst,
 * og at "venter på svar" er rigtig. Bliver den sidste forkert, står Meick med
 * en liste der siger han skylder svar han allerede har givet — og så holder
 * han op med at stole på den.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { awaitingReplyCount, conversations } from "./derive";
import type { Lead, Message, MessageDirection } from "./types";

let tæller = 0;

function besked(sendt: string, retning: MessageDirection): Message {
  tæller += 1;
  return {
    id: `m${tæller}`,
    lead_id: "l",
    channel: "email",
    direction: retning,
    external_id: `<${tæller}@test>`,
    counterparty: "kunde@eksempel.dk",
    subject: null,
    body: "tekst",
    sent_at: sendt,
    created_at: sendt,
  };
}

function lead(navn: string, messages: Message[]): Lead {
  return {
    id: navn,
    meta_id: null,
    created_time: "2026-09-01T10:00:00Z",
    platform: null,
    campaign_name: null,
    ad_name: null,
    form_name: null,
    meta_lead_status: null,
    name: navn,
    email: "kunde@eksempel.dk",
    phone: null,
    zip: null,
    city: null,
    description: null,
    status: "Nye",
    address: null,
    tags: [],
    value: null,
    price: null,
    start_date: null,
    duration_value: null,
    duration_unit: null,
    follow_up: null,
    updated_at: "2026-09-01T10:00:00Z",
    messages,
  };
}

test("leads uden beskeder er ikke samtaler", () => {
  const rækker = conversations([lead("Uden", []), lead("Med", [besked("2026-09-10T08:00:00Z", "ind")])]);
  assert.equal(rækker.length, 1);
  assert.equal(rækker[0].lead.name, "Med");
});

test("nyeste samtale står øverst", () => {
  const rækker = conversations([
    lead("Gammel", [besked("2026-09-01T08:00:00Z", "ind")]),
    lead("Nyest", [besked("2026-09-15T08:00:00Z", "ind")]),
    lead("Midt", [besked("2026-09-08T08:00:00Z", "ind")]),
  ]);
  assert.deepEqual(rækker.map((r) => r.lead.name), ["Nyest", "Midt", "Gammel"]);
});

test("seneste besked findes uanset rækkefølgen i arrayet", () => {
  // Beskederne hentes stigende, men koden må ikke afhænge af det.
  const rækker = conversations([
    lead("Rodet", [
      besked("2026-09-05T08:00:00Z", "ind"),
      besked("2026-09-12T08:00:00Z", "ud"),
      besked("2026-09-01T08:00:00Z", "ind"),
    ]),
  ]);
  assert.equal(rækker[0].latest.sent_at, "2026-09-12T08:00:00Z");
  assert.equal(rækker[0].antal, 3);
});

test("venter på svar når kunden skrev sidst", () => {
  const rækker = conversations([
    lead("Kunden skrev sidst", [
      besked("2026-09-01T08:00:00Z", "ud"),
      besked("2026-09-02T08:00:00Z", "ind"),
    ]),
    lead("Vi svarede", [
      besked("2026-09-01T08:00:00Z", "ind"),
      besked("2026-09-02T08:00:00Z", "ud"),
    ]),
  ]);
  const map = new Map(rækker.map((r) => [r.lead.name, r.venterPaaSvar]));
  assert.equal(map.get("Kunden skrev sidst"), true);
  assert.equal(map.get("Vi svarede"), false);
});

test("awaitingReplyCount tæller kun dem der venter", () => {
  const leads = [
    lead("A", [besked("2026-09-02T08:00:00Z", "ind")]),
    lead("B", [besked("2026-09-02T08:00:00Z", "ud")]),
    lead("C", [besked("2026-09-03T08:00:00Z", "ind")]),
    lead("D", []),
  ];
  assert.equal(awaitingReplyCount(leads), 2);
});
