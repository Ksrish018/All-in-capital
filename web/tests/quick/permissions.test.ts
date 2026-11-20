import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { can, isRole, ROLES, type Role } from "@/lib/actor";
import { ROOT, tag } from "../helpers";

const who = (rule: (r: Role) => boolean) => ROLES.filter(rule);

// PRD Section 3.2. There is no sign-in: the person picks their name, and roles still limit actions.
describe("permissions match the PRD", () => {
  it(tag("Critical", "P1", "only Riya can send an email"), () => {
    expect(who(can.sendEmail)).toEqual(["riya"]);
  });
  it(tag("Critical", "P2", "only Kushal signs off at Gate 2"), () => {
    expect(who(can.gate2)).toEqual(["kushal"]);
  });
  it(tag("High", "P3", "Riya and Kushal can act at Gate 1, Aditya cannot"), () => {
    expect(who(can.gate1)).toEqual(["riya", "kushal"]);
  });
  it(tag("High", "P4", "only Kushal approves the Thesis Card and changes the cost cap"), () => {
    expect(who(can.approveThesis)).toEqual(["kushal"]);
    expect(who(can.changeCostCap)).toEqual(["kushal"]);
  });
  it(tag("High", "P5", "the 'working as' value only accepts the three people"), () => {
    expect(ROLES).toEqual(["riya", "kushal", "aditya"]);
    for (const bad of ["admin", "", "RIYA", "founder", undefined, null, 1]) expect(isRole(bad)).toBe(false);
  });
  it(tag("High", "P6", "the people seeded in the database match the roles"), () => {
    const sql = fs.readFileSync(path.join(ROOT, "supabase/migrations/0002_no_login.sql"), "utf8");
    for (const r of ROLES) expect(sql).toContain(`'${r}'`);
  });
});
