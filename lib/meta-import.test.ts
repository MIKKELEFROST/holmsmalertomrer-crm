/**
 * Test af Meta-importparseren.
 *
 * Kør: npm test
 *
 * Kører mod data/meta-eksport-eksempel.csv, som er anonymiseret men i præcis
 * samme format som Metas rigtige eksport: UTF-16LE med BOM, tab-separeret,
 * citerede felter med linjeskift indeni. Den rigtige eksport ligger uden for
 * git, fordi den indeholder kundedata.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  cleanPhone,
  cleanZip,
  parseDelimited,
  parseMetaExport,
  platformName,
} from "./meta-import";

const sample = () =>
  new Uint8Array(readFileSync("data/meta-eksport-eksempel.csv"));

test("parser hele eksporten", () => {
  const leads = parseMetaExport(sample());
  assert.equal(leads.length, 3);
});

test("striber p:-prefikset af telefonnumre", () => {
  assert.equal(cleanPhone("p:+4523710924"), "+4523710924");
  assert.equal(cleanPhone("+4523710924"), "+4523710924");
  assert.equal(cleanPhone(""), null);
  assert.equal(cleanPhone(undefined), null);
});

test("oversætter platformkoder", () => {
  assert.equal(platformName("fb"), "Facebook");
  assert.equal(platformName("ig"), "Instagram");
  assert.equal(platformName(undefined), null);
});

test("trækker postnummer ud", () => {
  assert.equal(cleanZip("2600"), "2600");
  assert.equal(cleanZip("DK-2600 Glostrup"), "2600");
  assert.equal(cleanZip("ingen tal"), null);
});

test("slår by op ud fra postnummer", () => {
  const leads = parseMetaExport(sample());
  const anna = leads.find((l) => l.zip === "5210");
  assert.equal(anna?.city, "Odense NV");
});

test("holder sammen på felter med linjeskift indeni", () => {
  const leads = parseMetaExport(sample());
  const multiline = leads.find((l) => l.description?.includes("\n"));
  assert.ok(multiline, "forventede et lead med linjeskift i beskrivelsen");
  assert.match(multiline.description ?? "", /ny terrasse/);
  // Rækken må ikke være revet over: resten af felterne skal stadig være der.
  assert.equal(multiline.zip, "2600");
  assert.equal(multiline.platform, "Instagram");
});

test("citerede anførselstegn afkodes", () => {
  const rows = parseDelimited('a\t"si \\"hej\\""\n'.replace(/\\"/g, '""'));
  assert.deepEqual(rows[0], ["a", 'si "hej"']);
});

test("afviser rækker uden navn eller meta_id", () => {
  const text = [
    "id\tfull_name\tphone_number",
    "\tUden Id\tp:+4500000000",
    "l:123\t\tp:+4500000000",
    "l:456\tMed Begge\tp:+4500000000",
  ].join("\n");
  const bytes = new TextEncoder().encode(text);
  const leads = parseMetaExport(bytes);
  assert.equal(leads.length, 1);
  assert.equal(leads[0].name, "Med Begge");
});

test("fjerner dubletter på meta_id", () => {
  const text = [
    "id\tfull_name",
    "l:dup\tFørste",
    "l:dup\tAnden",
  ].join("\n");
  const leads = parseMetaExport(new TextEncoder().encode(text));
  assert.equal(leads.length, 1);
  assert.equal(leads[0].name, "Første");
});
