import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// Node-Runtime (Service-Role-Client) und nie cachen – der Ping soll bei JEDEM
// Aufruf die Datenbank tatsächlich berühren.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/ping — Keep-alive gegen den Supabase-Free-Tier-Auto-Pause.
 *
 * Supabase pausiert Free-Projekte nach ~7 Tagen ohne DB-Aktivität; dann ist die
 * App tot, bis man im Dashboard „Restore" drückt. Ein täglicher Vercel-Cron
 * (siehe vercel.json) ruft diese Route auf – der winzige COUNT-Query zählt als
 * Aktivität und hält das Projekt wach.
 *
 * Gibt bewusst KEINE Daten zurück, nur den Status – offen und harmlos.
 */
export async function GET() {
  try {
    const admin = createAdminClient();
    // head:true => reiner COUNT, keine Zeilen übertragen, aber echter DB-Zugriff.
    const { error } = await admin.from('metrics').select('id', { count: 'exact', head: true });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, at: new Date().toISOString() });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unbekannt';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
