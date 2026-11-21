// M8 quick tests: the password in front of the app (PRD 16.2, Q13).
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { tag } from "../helpers";

const req = (path: string, auth?: string) => new NextRequest(`http://localhost:3000${path}`, { headers: auth ? { authorization: auth } : {} });
const basic = (pw: string) => `Basic ${btoa(`team:${pw}`)}`;

describe("password gate", () => {
  afterEach(() => {
    delete process.env.APP_PASSWORD;
  });
  it(tag("High", "W1", "with no password set (local use), nothing is asked"), () => {
    expect(proxy(req("/")).status).toBe(200);
  });
  it(tag("Critical", "W2", "with a password set, every page and API asks for it"), () => {
    process.env.APP_PASSWORD = "correct horse battery";
    expect(proxy(req("/")).status).toBe(401);
    expect(proxy(req("/api/reviews")).status).toBe(401);
    expect(proxy(req("/", basic("wrong"))).status).toBe(401);
    expect(proxy(req("/", basic("correct horse battery"))).status).toBe(200);
  });
  it(tag("High", "W3", "the scheduler still reaches the worker routes, which keep their own secret"), () => {
    process.env.APP_PASSWORD = "correct horse battery";
    expect(proxy(req("/api/worker/screening")).status).toBe(200);
  });
});
