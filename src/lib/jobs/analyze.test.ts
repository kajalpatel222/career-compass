import { strict as assert } from "node:assert";
import { test } from "node:test";
import { analyzeJob } from "./analyze";

const profile = { targetRoles: ["Senior Frontend Engineer"], skills: ["React", "TypeScript", "Node.js"], preferredLocations: ["San Francisco"], minimumSalary: 150000 };

test("scores a closely matching job highly", () => {
  const result = analyzeJob(profile, { role: "Senior Frontend Engineer", company: "Acme", location: "San Francisco, CA", description: "React TypeScript Node.js", salary: "$180,000" });
  assert.equal(result.matchScore, 100);
  assert.equal(result.recommendation, "Strongly recommended");
  assert.match(result.reasoning, /100\/100/);
});

test("reports gaps and salary concerns for a weak match", () => {
  const result = analyzeJob(profile, { role: "Backend Engineer", company: "Acme", location: "New York", description: "Python", salary: "$120,000" });
  assert.ok(result.matchScore < 50);
  assert.ok(result.gaps.length >= 2);
  assert.ok(result.concerns.some((concern) => concern.includes("minimum")));
});

