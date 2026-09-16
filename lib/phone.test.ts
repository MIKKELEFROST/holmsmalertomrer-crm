/**
 * Test af telefonnormaliseringen.
 *
 * Kør: npm test
 *
 * Numrene her er de skrivemåder der faktisk er set i leads-tabellen: Metas
 * "p:"-præfiks, mellemrum fra håndindtastning, landekode i tre varianter.
 * Matcher de ikke hinanden, ryger indkommende SMS'er i uafklaret.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPhone, phoneKey, toMsisdn } from "./phone";

test("phoneKey rammer samme nøgle uanset skrivemåde", () => {
  const forventet = "12345678";
  for (const skrivemaade of [
    "12345678",
    "12 34 56 78",
    "+45 12345678",
    "+4512345678",
    "004512345678",
    "0045 12 34 56 78",
    "45-12-34-56-78",
  ]) {
    assert.equal(phoneKey(skrivemaade), forventet, skrivemaade);
  }
});

test("phoneKey afviser det der ikke er et nummer", () => {
  assert.equal(phoneKey(null), null);
  assert.equal(phoneKey(undefined), null);
  assert.equal(phoneKey(""), null);
  assert.equal(phoneKey("ikke et nummer"), null);
  // For kort til at være dansk — bedre ingen match end forkert match.
  assert.equal(phoneKey("1234567"), null);
});

test("toMsisdn sætter dansk landekode på otte cifre", () => {
  assert.equal(toMsisdn("12345678"), "4512345678");
  assert.equal(toMsisdn("12 34 56 78"), "4512345678");
  assert.equal(toMsisdn("+45 12 34 56 78"), "4512345678");
  assert.equal(toMsisdn("004512345678"), "4512345678");
});

test("toMsisdn lader en eksisterende landekode stå", () => {
  // Tysk nummer — sommerhuskunder findes.
  assert.equal(toMsisdn("+49 176 12345678"), "4917612345678");
  assert.equal(toMsisdn("004917612345678"), "4917612345678");
});

test("toMsisdn afviser numre der er for korte til at sende til", () => {
  assert.equal(toMsisdn("1234567"), null);
  assert.equal(toMsisdn(""), null);
  assert.equal(toMsisdn(null), null);
});

test("formatPhone grupperer to og to", () => {
  assert.equal(formatPhone("4512345678"), "+45 12 34 56 78");
  assert.equal(formatPhone("12345678"), "12 34 56 78");
  // Ukendt format vises som det står frem for at blive maltrakteret.
  assert.equal(formatPhone("ikke et nummer"), "ikke et nummer");
  assert.equal(formatPhone(null), "");
});
