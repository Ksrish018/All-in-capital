import "server-only";
import pg from "pg";

// A small direct Postgres pool, for the queue (pgmq) and for writes that must happen together.
// Everything else uses the Supabase admin client.
const g = globalThis as unknown as { __pool?: pg.Pool };

export function pool(): pg.Pool {
  if (!g.__pool) {
    const url = process.env.SUPABASE_URL;
    if (!url || !process.env.SUPABASE_DB_HOST || !process.env.SUPABASE_DB_PASSWORD) {
      throw new Error("SUPABASE_URL, SUPABASE_DB_HOST and SUPABASE_DB_PASSWORD must be set in the root .env");
    }
    g.__pool = new pg.Pool({
      host: process.env.SUPABASE_DB_HOST,
      port: 5432,
      user: `postgres.${new URL(url).hostname.split(".")[0]}`,
      password: process.env.SUPABASE_DB_PASSWORD,
      database: "postgres",
      ssl: { rejectUnauthorized: false },
      max: 5,
    });
  }
  return g.__pool;
}

export type QueueMessage<T> = { msg_id: number; read_ct: number; message: T };

export const queue = {
  async send<T>(name: string, message: T): Promise<number> {
    const r = await pool().query("select * from pgmq.send($1, $2::jsonb)", [name, JSON.stringify(message)]);
    return Number(r.rows[0].send);
  },
  /** Reads up to qty messages and hides them for vtSeconds. A message comes back if it is not deleted in time. */
  async read<T>(name: string, vtSeconds: number, qty: number): Promise<QueueMessage<T>[]> {
    const r = await pool().query("select msg_id, read_ct, message from pgmq.read($1, $2, $3)", [name, vtSeconds, qty]);
    return r.rows.map((x) => ({ msg_id: Number(x.msg_id), read_ct: Number(x.read_ct), message: x.message as T }));
  },
  async remove(name: string, msgId: number): Promise<void> {
    await pool().query("select pgmq.delete($1, $2::bigint)", [name, msgId]);
  },
  /** Place in line for each application waiting in the queue. */
  async positions(name: string): Promise<Map<string, number>> {
    const r = await pool().query(`select message->>'application_id' as id from pgmq.q_${name.replace(/\W/g, "")} order by msg_id`);
    return new Map(r.rows.map((x, i) => [x.id as string, i + 1]));
  },
};

/**
 * Worker slots (M9). Every worker, however it was started, must hold a slot for each application it screens,
 * so no more than `max` are screened at once across all of them. A slot is leased for leaseSeconds.
 */
export const slots = {
  async claim(max: number, want: number, holder: string, leaseSeconds = 600): Promise<number[]> {
    if (want <= 0) return [];
    const r = await pool().query(
      `with free as (
         select slot from public.worker_slots where slot <= $1 and until < now() order by slot limit $2 for update skip locked
       )
       update public.worker_slots w set holder = $3, until = now() + make_interval(secs => $4)
         from free where w.slot = free.slot returning w.slot`,
      [max, want, holder, leaseSeconds],
    );
    return r.rows.map((x) => Number(x.slot));
  },
  async release(slot: number, holder: string): Promise<void> {
    await pool().query("update public.worker_slots set until = 'epoch', holder = null where slot = $1 and holder = $2", [slot, holder]);
  },
};
