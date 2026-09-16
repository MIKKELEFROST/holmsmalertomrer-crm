/**
 * Test af citatafskæringen.
 *
 * Kør: npm test
 *
 * Mønstrene her er ikke opfundet — de er skrevet ud fra rigtige mails.
 * Gmail-varianten nedenfor er ordret den streng der stod i databasen efter
 * den første rigtige test 16-09-2026, hvor citatet IKKE blev skåret fra.
 *
 * Uden afskæringen består den tiende besked i en tråd af de ni foregående,
 * og korrespondancen bliver ulæselig efter tredje svar.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { stripQuotedText } from "./messages";

test("Gmail på dansk — ugedag først, adressen ombrudt", () => {
  // Præcis som den så ud i produktionen. Bemærk at linjen hverken begynder
  // med "Den" eller slutter med kolon; det var dét der brød det første forsøg.
  const body = [
    "Hej Meick dette er blot en test",
    "",
    "ons. 16. sep. 2026 kl. 13.35 skrev Holms Maler & Tømrer ApS <",
    "tomrer@holmsmaler.dk>:",
    "",
    "> Hej Mikkel",
    "> Jeg kan se du skal bruge hjælp",
  ].join("\n");

  assert.equal(stripQuotedText(body), "Hej Meick dette er blot en test");
});

test("Apple Mail og Outlook på dansk", () => {
  const body = [
    "Ja tak, det lyder fint.",
    "",
    "Den 16. sep. 2026 kl. 13.35 skrev Meick <meick@holmsmaler.dk>:",
    "> Kan du torsdag?",
  ].join("\n");

  assert.equal(stripQuotedText(body), "Ja tak, det lyder fint.");
});

test("engelsk klient", () => {
  const body = [
    "Sounds good.",
    "",
    "On Wed, 16 Sep 2026 at 13:35, Meick <meick@holmsmaler.dk> wrote:",
    "> Can you do Thursday?",
  ].join("\n");

  assert.equal(stripQuotedText(body), "Sounds good.");
});

test("videresendt mail med Fra-hoved", () => {
  const body = ["Se lige den her.", "", "Fra: Kunde <kunde@eksempel.dk>", "Emne: Tag"].join("\n");
  assert.equal(stripQuotedText(body), "Se lige den her.");
});

test("almindelig tekst røres ikke", () => {
  // "skrev" alene må ikke udløse afskæring — ellers forsvinder halvdelen af
  // en helt normal sætning.
  const body = "Hej Meick\n\nJeg skrev til dig i sidste uge om taget. Kan du kigge på det?";
  assert.equal(stripQuotedText(body), body);
});

test("en mail der kun består af citat viser citatet", () => {
  // Bedre at vise noget end ingenting: så ved man i det mindste at der kom
  // en besked.
  const body = "> Kan du torsdag?\n> Mvh Meick";
  assert.equal(stripQuotedText(body), body);
});
