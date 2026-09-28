import { sql } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const r = await sql()`select jsonb_array_length(dash.weeks()) as weeks`;
    return Response.json({ ok: true, weeks: r[0].weeks });
  } catch (e) {
    return Response.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
  }
}
