import { describe, expect, it } from "vitest";
import { can, type Role } from "@/lib/auth";
import { tag } from "../helpers";

const ROLES: Role[] = ["riya", "kushal", "aditya", "admin"];
const who = (rule: (r: Role) => boolean) => ROLES.filter(rule);

// PRD Section 3.2. Admin may act as any role during development.
describe("permissions match the PRD", () => {
  it(tag("Critical", "P1", "only Riya (or admin) can send an email"), () => {
    expect(who(can.sendEmail)).toEqual(["riya", "admin"]);
  });
  it(tag("Critical", "P2", "only Kushal (or admin) signs off at Gate 2"), () => {
    expect(who(can.gate2)).toEqual(["kushal", "admin"]);
  });
  it(tag("High", "P3", "Riya and Kushal (or admin) can act at Gate 1, Aditya cannot"), () => {
    expect(who(can.gate1)).toEqual(["riya", "kushal", "admin"]);
  });
  it(tag("High", "P4", "only Kushal (or admin) approves the Thesis Card and changes the cost cap"), () => {
    expect(who(can.approveThesis)).toEqual(["kushal", "admin"]);
    expect(who(can.changeCostCap)).toEqual(["kushal", "admin"]);
  });
});
