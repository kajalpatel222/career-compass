import { strict as assert } from "node:assert";
import { test } from "node:test";
import { dedupeJobs } from "./dedupe";
import type { NormalizedJob } from "./normalize";

const job = (overrides: Partial<NormalizedJob> = {}): NormalizedJob => ({
  title: "Senior Frontend Engineer", company: "Acme", location: "San Francisco, CA", description: "", salary: null, url: "https://jobs.example.com/roles/123", source: "Indeed", postedAt: null, posted: null, ...overrides,
});

test("removes postings with duplicate URLs", () => {
  assert.equal(dedupeJobs([job(), job({ title: "Frontend Engineer", url: " https://jobs.example.com/roles/123#details " })]).length, 1);
});

test("removes postings with normalized title, company, and location matches", () => {
  assert.equal(dedupeJobs([job({ title: "Senior   Frontend Engineer", company: "Acme, Inc." }), job({ title: " senior frontend engineer ", company: "ACME, INC.", url: "https://board.example.com/second" })]).length, 1);
});

test("keeps distinct jobs", () => {
  assert.equal(dedupeJobs([job(), job({ title: "Staff Frontend Engineer", url: "https://jobs.example.com/roles/456" }), job({ location: "Remote", url: "https://jobs.example.com/roles/789" })]).length, 3);
});
