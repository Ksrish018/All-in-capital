// Recomputes the recommendation for one application from its current ratings, in code.
// Usage: npx tsx --conditions=react-server scripts/recompute.mts <application id>
import path from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(path.resolve(import.meta.dirname, "..", ".."));
const { recomputeRecommendation } = await import("../src/lib/gates-server");
const id = process.argv[2];
if (!id) throw new Error("Pass an application id");
await recomputeRecommendation(id);
console.log(`recomputed ${id}`);
process.exit(0);
