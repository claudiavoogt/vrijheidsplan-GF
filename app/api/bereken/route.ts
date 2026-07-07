import { NextRequest, NextResponse } from 'next/server';

interface Fase {
  van: number;
  tot: number;
  bedrag: number;
}

interface FaseResultaat {
  van: number;
  tot: number;
  bedrag: number;
  ingelegd: number;
  kapVoor: number;
  kapNa: number;
  index: number;
}

interface Scenario {
  eindKapitaal: number;
  totaalIngelegd: number;
  totaalJaren: number;
  resultaten: FaseResultaat[];
}

function berekenScenario(fases: Fase[], doel: number, rendPct: number): Scenario {
  // Sorteren op leeftijd, ongeacht de volgorde waarin de fases zijn ingevoerd of getypt.
  // Zonder dit compoundt de rente in de volgorde van de lijst in plaats van in de volgorde
  // van de tijd, en dat geeft absurd hoge (of lage) eindbedragen zodra iemand een fase
  // toevoegt of aanpast die niet meer chronologisch aansluit op de rest.
  const gesorteerd = [...fases].sort((a, b) => a.van - b.van);

  const maandRente = Math.pow(1 + rendPct / 100, 1 / 12) - 1;
  let kap = 0;
  let totIngelegd = 0;
  const resultaten: FaseResultaat[] = [];

  gesorteerd.forEach((f, i) => {
    const maanden = Math.max(0, Math.round((f.tot - f.van) * 12));
    const kapVoor = kap;
    let ingelegd = 0;
    for (let m = 0; m < maanden; m++) {
      kap = kap * (1 + maandRente) + f.bedrag;
      ingelegd += f.bedrag;
    }
    totIngelegd += ingelegd;
    resultaten.push({ van: f.van, tot: f.tot, bedrag: f.bedrag, ingelegd, kapVoor, kapNa: kap, index: i });
  });

  const laatste = gesorteerd[gesorteerd.length - 1];
  if (laatste && laatste.tot < doel) {
    const maanden = Math.round((doel - laatste.tot) * 12);
    for (let m = 0; m < maanden; m++) kap = kap * (1 + maandRente);
  }

  return {
    eindKapitaal: kap,
    totaalIngelegd: totIngelegd,
    resultaten,
    totaalJaren: gesorteerd[0] ? doel - gesorteerd[0].van : 0,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const fases: Fase[] = body.fases;
    const doel: number = body.doel;
    const rend: number = body.rend;
    const spaarrente: number = typeof body.spaarrente === 'number' ? body.spaarrente : 1.5;

    if (!Array.isArray(fases) || fases.length === 0 || typeof doel !== 'number' || typeof rend !== 'number') {
      return NextResponse.json({ error: 'bad request' }, { status: 400 });
    }

    const belegd = berekenScenario(fases, doel, rend);
    const gespaard = berekenScenario(fases, doel, spaarrente);
    const verschil = belegd.eindKapitaal - gespaard.eindKapitaal;

    return NextResponse.json({ belegd, gespaard, verschil });
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
}
