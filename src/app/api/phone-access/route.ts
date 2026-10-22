import { NextResponse, type NextRequest } from 'next/server';

// Liefert dem TV die Zusatz-Parameter, mit denen ein Handy per QR-Code durch den
// Vercel-Deployment-Schutz einer VORSCHAU kommt, ohne sich bei Vercel anzumelden.
// In Produktion (eigene Domain, kein Schutz) gibt es nichts zurück.
//
// Reihenfolge:
// 1. VERCEL_AUTOMATION_BYPASS_SECRET (setzt Vercel automatisch, sobald im Projekt
//    „Protection Bypass for Automation" aktiv ist) – läuft nicht ab.
// 2. Der Freigabe-Token, mit dem DIESER Browser selbst hereingekommen ist: Vercel legt
//    ihn nach ?_vercel_share=… als Cookie _vercel_jwt ab (Feld „bypass" im JWT).
export const dynamic = 'force-dynamic';

function shareFromJwt(jwt: string | undefined): string | null {
  if (!jwt) return null;
  try {
    const part = jwt.split('.')[1];
    if (!part) return null;
    const json = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (typeof json.bypass === 'string' && json.bypass) {
      if (typeof json.exp === 'number' && json.exp * 1000 < Date.now()) return null;
      return json.bypass;
    }
  } catch { /* kein lesbarer Token */ }
  return null;
}

export async function GET(req: NextRequest) {
  const env = process.env.VERCEL_ENV;
  if (env === 'production') return NextResponse.json({ query: '' });
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (secret) {
    return NextResponse.json({
      query: `x-vercel-protection-bypass=${encodeURIComponent(secret)}&x-vercel-set-bypass-cookie=true`,
      via: 'automation',
    }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const share = shareFromJwt(req.cookies.get('_vercel_jwt')?.value);
  if (share) {
    return NextResponse.json({ query: `_vercel_share=${encodeURIComponent(share)}`, via: 'share-cookie' }, { headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ query: '', via: 'none', cookie: !!req.cookies.get('_vercel_jwt') }, { headers: { 'Cache-Control': 'no-store' } });
}
