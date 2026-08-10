import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const from = form.get('from') ?? '';
  const to = form.get('to') ?? '';
  return NextResponse.json({ ok: true, from, to, timestamp: new Date().toISOString() });
}

export async function GET() {
  return NextResponse.json({ ok: true, timestamp: new Date().toISOString() });
}
