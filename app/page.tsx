'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ── GF huisstijl ──────────────────────────────────────────────
const GF = {
  paars: '#6B2D84',
  fuchsia: '#E21B70',
  navy: '#1A1F36',
  mint: '#3EDCB1',
  oranje: '#FF6B35',
  smoke: '#F7F7FA',
  wit: '#FFFFFF',
};
const KLEUREN = [GF.paars, GF.fuchsia, GF.mint, GF.oranje, GF.navy];

interface Fase {
  van: number;
  tot: number;
  bedrag: number;
}

interface FaseResultaat {
  van: number; tot: number; bedrag: number;
  ingelegd: number; kapVoor: number; kapNa: number; index: number;
}

interface Scenario {
  eindKapitaal: number;
  totaalIngelegd: number;
  totaalJaren: number;
  resultaten: FaseResultaat[];
}

interface Results {
  belegd: Scenario;
  gespaard: Scenario;
  verschil: number;
}

const DEFAULT_FASES: Fase[] = [
  { van: 11, tot: 16, bedrag: 10 },
  { van: 16, tot: 18, bedrag: 25 },
  { van: 18, tot: 30, bedrag: 75 },
  { van: 30, tot: 50, bedrag: 150 },
];

function eur(n: number): string {
  if (Math.abs(n) >= 1_000_000) return '€ ' + (n / 1_000_000).toFixed(2).replace('.', ',') + ' mln';
  return '€ ' + Math.round(n).toLocaleString('nl-NL');
}

function useCountUp(target: number, duration = 1400, trigger = true) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!trigger) return;
    let start: number | null = null;
    let raf: number;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(target * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, trigger]);
  return val;
}

const STAPPEN = ['welkom', 'naam', 'doel', 'fases', 'rendement', 'onthulling', 'plan'];

export default function VrijheidsplanWizard() {
  const [stap, setStap] = useState(0);
  const [naam, setNaam] = useState('');
  const [doel, setDoel] = useState(50);
  const [rend, setRend] = useState(10);
  const [fases, setFases] = useState<Fase[]>(DEFAULT_FASES.map(f => ({ ...f })));
  const [results, setResults] = useState<Results | null>(null);
  const [laden, setLaden] = useState(false);
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<any>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const naamWeergave = naam.trim() || 'je kind';

  // ── Beschermingslaag: berekening loopt via de API, niet in de browser ──
  const fetchResults = useCallback(async (f: Fase[], d: number, r: number) => {
    setLaden(true);
    try {
      const res = await fetch('/api/bereken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fases: f, doel: d, rend: r }),
      });
      const data: Results = await res.json();
      setResults(data);
    } catch {
      // Stille fout, vorige staat blijft staan
    } finally {
      setLaden(false);
    }
  }, []);

  const fetchDebounced = useCallback((f: Fase[], d: number, r: number) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => fetchResults(f, d, r), 300);
  }, [fetchResults]);

  useEffect(() => {
    fetchResults(fases, doel, rend);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchDebounced(fases, doel, rend);
  }, [fases, doel, rend, fetchDebounced]);

  function updateFase(i: number, key: keyof Fase, val: number) {
    setFases(prev => prev.map((f, idx) => idx === i ? { ...f, [key]: val } : f));
  }
  function addFase() {
    const last = fases[fases.length - 1];
    setFases(prev => [...prev, { van: last ? last.tot : 11, tot: last ? last.tot + 10 : 21, bedrag: last ? Math.round(last.bedrag * 1.5) : 50 }]);
  }
  function removeFase(i: number) {
    setFases(prev => prev.filter((_, idx) => idx !== i));
  }

  const volgende = () => setStap(s => Math.min(STAPPEN.length - 1, s + 1));
  const vorige = () => setStap(s => Math.max(0, s - 1));

  const belegd = results?.belegd ?? { eindKapitaal: 0, totaalIngelegd: 0, totaalJaren: 0, resultaten: [] as FaseResultaat[] };
  const gespaard = results?.gespaard ?? { eindKapitaal: 0, totaalIngelegd: 0, totaalJaren: 0, resultaten: [] as FaseResultaat[] };
  const verschil = results?.verschil ?? 0;

  // ── Chart op onthulling-stap ──
  const drawChart = useCallback(() => {
    const Chart = (window as any).Chart;
    if (!Chart || !chartRef.current || !results) return;
    if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; }
    const labels = belegd.resultaten.map(r => `${r.van}-${r.tot}`);
    chartInstance.current = new Chart(chartRef.current.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Beleggen', data: belegd.resultaten.map(r => r.kapNa), borderColor: GF.paars, backgroundColor: 'rgba(107,45,132,0.08)', borderWidth: 3, pointRadius: 0, fill: true, tension: 0.4 },
          { label: 'Sparen', data: gespaard.resultaten.map(r => r.kapNa), borderColor: GF.navy, backgroundColor: 'rgba(26,31,54,0.04)', borderWidth: 2, borderDash: [5, 4], pointRadius: 0, fill: true, tension: 0.4 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { font: { family: 'Montserrat', weight: '700', size: 11 }, color: GF.navy } } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: 'rgba(26,31,54,0.4)' } },
          y: { grid: { color: 'rgba(26,31,54,0.05)' }, ticks: { font: { size: 10 }, color: 'rgba(26,31,54,0.4)', callback: (v: number) => eur(v) } },
        },
      },
    });
  }, [belegd, gespaard, results]);

  useEffect(() => {
    if (STAPPEN[stap] !== 'onthulling' || !results) return;
    if ((window as any).Chart) { drawChart(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
    script.onload = drawChart;
    document.head.appendChild(script);
  }, [stap, drawChart, results]);

  const showCount = STAPPEN[stap] === 'onthulling' && !!results;
  const spaarCount = useCountUp(gespaard.eindKapitaal, 1200, showCount);
  const beleggenCount = useCountUp(belegd.eindKapitaal, 1800, showCount);
  const verschilCount = useCountUp(verschil, 2200, showCount);

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&family=Lora:ital@0;1&family=Pacifico&display=swap" rel="stylesheet" />
      <style>{`
        html, body { margin: 0 !important; padding: 0 !important; background: ${GF.smoke} !important; }
        .vp-wrap { font-family: 'Lora', serif; color: ${GF.navy}; background: ${GF.smoke}; min-height: 100vh; padding: 0 0 60px; }
        .vp-inner { max-width: 640px; margin: 0 auto; padding: 0 20px; }
        .vp-progress { display: flex; gap: 6px; padding: 20px 20px 0; max-width: 640px; margin: 0 auto; }
        .vp-dot { flex: 1; height: 4px; border-radius: 2px; background: rgba(107,45,132,0.15); }
        .vp-dot.actief { background: ${GF.fuchsia}; }
        .vp-card { background: #fff; border-radius: 16px; padding: 32px 28px; margin-top: 24px; box-shadow: 0 4px 24px rgba(26,31,54,0.06); }
        h1.vp-h1 { font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: clamp(22px,4vw,30px); line-height: 1.2; margin: 0 0 14px; color: ${GF.navy}; }
        .vp-sub { font-family: 'Lora', serif; font-style: italic; font-size: 15px; line-height: 1.7; opacity: 0.75; margin-bottom: 22px; }
        .vp-label { font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 12px; letter-spacing: 0.5px; color: ${GF.paars}; text-transform: uppercase; display: block; margin-bottom: 8px; }
        .vp-input { width: 100%; font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 18px; padding: 12px 14px; border: 2px solid rgba(107,45,132,0.2); border-radius: 10px; outline: none; color: ${GF.navy}; box-sizing: border-box; }
        .vp-input:focus { border-color: ${GF.fuchsia}; }
        .vp-btn { font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 15px; border: none; border-radius: 30px; padding: 15px 28px; cursor: pointer; color: #fff; background: linear-gradient(135deg, ${GF.fuchsia} 0%, ${GF.paars} 100%); box-shadow: 0 6px 18px rgba(226,27,112,0.3); }
        .vp-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .vp-btn-ghost { font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 14px; border: none; background: none; color: ${GF.navy}; opacity: 0.5; cursor: pointer; padding: 15px 10px; }
        .vp-nav { display: flex; justify-content: space-between; align-items: center; margin-top: 26px; }
        .vp-rocket { font-size: 54px; text-align: center; margin-bottom: 6px; }
        .vp-badge { display: inline-block; background: rgba(107,45,132,0.1); border: 1px solid rgba(107,45,132,0.25); border-radius: 20px; font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: ${GF.paars}; padding: 5px 12px; margin-bottom: 14px; }
        .vp-slider { width: 100%; margin-top: 8px; accent-color: ${GF.fuchsia}; }
        .vp-fase-row { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; flex-wrap: nowrap; }
        .vp-dot-kleur { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .vp-fi { width: 56px; font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 14px; padding: 8px; border: 1.5px solid rgba(107,45,132,0.25); border-radius: 8px; text-align: center; }
        .vp-fi.bedrag { width: 72px; }
        .vp-fase-context { font-family: 'Lora', serif; font-style: italic; font-size: 12px; opacity: 0.55; margin-left: 20px; margin-bottom: 14px; }
        .vp-remove { border: none; background: none; color: ${GF.fuchsia}; font-size: 18px; cursor: pointer; opacity: 0.5; }
        .vp-add { border: 1.5px dashed rgba(107,45,132,0.3); background: none; color: ${GF.paars}; font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 13px; border-radius: 10px; padding: 10px; width: 100%; cursor: pointer; margin-top: 6px; }
        .vp-explain { background: ${GF.smoke}; border-left: 3px solid ${GF.mint}; border-radius: 10px; padding: 18px 20px; font-size: 14px; line-height: 1.8; }
        .vp-compare { display: flex; gap: 14px; margin: 24px 0; }
        .vp-cbox { flex: 1; border-radius: 14px; padding: 20px 14px; text-align: center; }
        .vp-cbox.spaar { background: rgba(26,31,54,0.05); }
        .vp-cbox.beleggen { background: linear-gradient(135deg, rgba(226,27,112,0.1), rgba(107,45,132,0.1)); border: 1.5px solid ${GF.paars}; }
        .vp-cbox-label { font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.6; display: block; margin-bottom: 6px; }
        .vp-cbox-val { font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 22px; }
        .vp-verschil { text-align: center; margin: 18px 0 6px; }
        .vp-verschil-val { font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 34px; color: ${GF.mint}; }
        .vp-verschil-sub { font-family: 'Lora', serif; font-style: italic; font-size: 13px; opacity: 0.6; }
        .vp-chart-wrap { height: 220px; margin-top: 20px; }
        .vp-loading { text-align: center; font-family: 'Montserrat', sans-serif; font-size: 13px; opacity: 0.5; padding: 20px 0; }
        .vp-banner { position: relative; width: 100%; overflow: hidden; background: ${GF.navy}; }
        .vp-banner img { width: 100%; height: auto; display: block; }
        .vp-banner::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 100px; background: linear-gradient(to bottom, transparent, ${GF.smoke}); pointer-events: none; }
        .vc-footer { background:linear-gradient(110deg,#211A3A,#4A2168 50%,#7A2D8F); padding:36px 20px; text-align:center; }
        .vc-copy { color:#cdbcd9; font-size:13px; margin:0; }
        @media print {
          .vp-no-print { display: none !important; }
          .vp-print-only { display: block !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
        }
        .vp-print-only { display: none; }
      `}</style>

      <div className="vp-wrap">
        <div className="vp-banner vp-no-print">
          <img src="/banner-generatie-fearless.png" alt="Generatie Fearless" />
        </div>
        <div className="vp-progress vp-no-print">
          {STAPPEN.slice(0, -1).map((_, i) => (
            <div key={i} className={`vp-dot ${i <= stap ? 'actief' : ''}`} />
          ))}
        </div>

        <div className="vp-inner vp-no-print">
          {/* STAP 0 — WELKOM */}
          {STAPPEN[stap] === 'welkom' && (
            <div className="vp-card" style={{ textAlign: 'center' }}>
              <div className="vp-rocket">🚀</div>
              <span className="vp-badge">Het Vrijheidsplan</span>
              <h1 className="vp-h1">Wat als je kind op z'n 40e nooit meer over geld hoeft te piekeren?</h1>
              <p className="vp-sub">Vul in 3 minuten in wat jouw kind opzij zet en zie precies wat dat wordt. Beleggen is geen belofte, het is een keuze die de tijd voor je laat werken.</p>
              <button className="vp-btn" onClick={volgende}>Start het Vrijheidsplan van mijn kind</button>
            </div>
          )}

          {/* STAP 1 — NAAM */}
          {STAPPEN[stap] === 'naam' && (
            <div className="vp-card">
              <span className="vp-label">Voor wie maken we dit plan?</span>
              <h1 className="vp-h1">Hoe heet je kind?</h1>
              <input className="vp-input" type="text" placeholder="Bijv. Sophie" value={naam} onChange={e => setNaam(e.target.value)} />
              <div className="vp-nav">
                <button className="vp-btn-ghost" onClick={vorige}>← Terug</button>
                <button className="vp-btn" onClick={volgende} disabled={!naam.trim()}>Volgende</button>
              </div>
            </div>
          )}

          {/* STAP 2 — DOEL */}
          {STAPPEN[stap] === 'doel' && (
            <div className="vp-card">
              <span className="vp-label">Op welke leeftijd wil je dat {naamWeergave} dit geld tot z'n beschikking heeft?</span>
              <h1 className="vp-h1">De doelleeftijd van {naamWeergave}</h1>
              <p className="vp-sub">Een tiener heeft iets dat jij als volwassene nooit meer terugkrijgt: <strong>tijd</strong>. Elke euro die nu wordt ingelegd, krijgt jaren langer de kans om te groeien dan wanneer jijzelf op je 30e was begonnen. Die voorsprong in tijd is precies waar dit plan om draait.</p>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 32, textAlign: 'center', color: GF.paars }}>{doel} jaar</div>
              <input className="vp-slider" type="range" min={15} max={80} value={doel} onChange={e => setDoel(parseInt(e.target.value))} />
              <div className="vp-nav">
                <button className="vp-btn-ghost" onClick={vorige}>← Terug</button>
                <button className="vp-btn" onClick={volgende}>Volgende</button>
              </div>
            </div>
          )}

          {/* STAP 3 — FASES */}
          {STAPPEN[stap] === 'fases' && (
            <div className="vp-card">
              <span className="vp-label">Wat legt {naamWeergave} in, per levensfase?</span>
              <h1 className="vp-h1" style={{ fontSize: 22 }}>De tijdlijn van {naamWeergave}</h1>
              <p className="vp-sub" style={{ marginBottom: 18 }}>Leeftijden en inleg pas je aan door er gewoon in te klikken. Een fase niet van toepassing? Weg ermee met het kruisje. Mist er een fase? Voeg 'm toe onderaan.</p>
              {fases.map((f, i) => {
                const context = ['zakgeld of klusgeld', 'bijbaantje begint', 'eerste baan, serieuzer bedrag', 'carrière gemaakt, inkomen op niveau'][i] || '';
                return (
                  <div key={i}>
                    <div className="vp-fase-row">
                      <div className="vp-dot-kleur" style={{ background: KLEUREN[i % KLEUREN.length] }} />
                      <input className="vp-fi" type="number" value={f.van} onChange={e => updateFase(i, 'van', parseFloat(e.target.value) || 0)} />
                      <span>→</span>
                      <input className="vp-fi" type="number" value={f.tot} onChange={e => updateFase(i, 'tot', parseFloat(e.target.value) || 0)} />
                      <span>€</span>
                      <input className="vp-fi bedrag" type="number" value={f.bedrag} onChange={e => updateFase(i, 'bedrag', parseFloat(e.target.value) || 0)} />
                      <span style={{ fontSize: 12, opacity: 0.6 }}>/mnd</span>
                      {fases.length > 1 && <button className="vp-remove" onClick={() => removeFase(i)}>×</button>}
                    </div>
                    {context && <div className="vp-fase-context">{context}</div>}
                  </div>
                );
              })}
              <button className="vp-add" onClick={addFase}>+ Voeg fase toe</button>
              <div className="vp-nav">
                <button className="vp-btn-ghost" onClick={vorige}>← Terug</button>
                <button className="vp-btn" onClick={volgende}>Volgende</button>
              </div>
            </div>
          )}

          {/* STAP 4 — RENDEMENT UITLEG */}
          {STAPPEN[stap] === 'rendement' && (
            <div className="vp-card">
              <h1 className="vp-h1">Waarom rekenen we met 10%?</h1>
              <div className="vp-explain">
                Dit is geen wensdenken. Het is het historisch gemiddelde van breed gespreide ETF's. Dat betekent niet dat elk jaar 10% oplevert.
                Sommige jaren staat de teller op een negatief rendement, andere jaren dik in de plus.
                Maar als je al die jaren bij elkaar optelt en daar het gemiddelde van neemt, dan komt het uit op gemiddeld 10%. Daarom is het zo ontzettend belangrijk dat als je gaat beleggen, je dit ook echt voor zeer lange tijd gaat doen.
                Rendementen uit het verleden bieden geen garantie voor de toekomst, dat blijft altijd waar.
                Maar tijd en geduld zijn de 2 dingen die dit gemiddelde laten werken, en die heeft een tiener in overvloed.
              </div>
              <div style={{ marginTop: 22 }}>
                <span className="vp-label">Gemiddeld jaarlijks rendement</span>
                <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 26, color: GF.paars }}>{rend}%</div>
                <input className="vp-slider" type="range" min={1} max={15} step={0.5} value={rend} onChange={e => setRend(parseFloat(e.target.value))} />
              </div>
              <div className="vp-nav">
                <button className="vp-btn-ghost" onClick={vorige}>← Terug</button>
                <button className="vp-btn" onClick={volgende}>Volgende</button>
              </div>
            </div>
          )}

          {/* STAP 5 — ONTHULLING */}
          {STAPPEN[stap] === 'onthulling' && (
            <div className="vp-card">
              <h1 className="vp-h1">Dit bouwt {naamWeergave} zelf op</h1>
              {(laden || !results) ? (
                <p className="vp-loading">Even rekenen…</p>
              ) : (
                <>
                  <div className="vp-compare">
                    <div className="vp-cbox spaar">
                      <span className="vp-cbox-label">Als {naamWeergave} spaart</span>
                      <div className="vp-cbox-val">{eur(spaarCount)}</div>
                    </div>
                    <div className="vp-cbox beleggen">
                      <span className="vp-cbox-label">Als {naamWeergave} belegt</span>
                      <div className="vp-cbox-val" style={{ color: GF.paars }}>{eur(beleggenCount)}</div>
                    </div>
                  </div>
                  <div className="vp-verschil">
                    <div className="vp-verschil-val">{eur(verschilCount)}</div>
                    <div className="vp-verschil-sub">Dat verschil verdient {naamWeergave} niet met werken. Dat verdient {naamWeergave} met tijd.</div>
                  </div>
                  <div className="vp-chart-wrap"><canvas ref={chartRef}></canvas></div>
                </>
              )}
              <div className="vp-nav">
                <button className="vp-btn-ghost" onClick={vorige}>← Terug</button>
                <button className="vp-btn" onClick={volgende} disabled={laden || !results}>Bekijk het plan</button>
              </div>
            </div>
          )}

          {/* STAP 6 — PLAN / PDF */}
          {STAPPEN[stap] === 'plan' && (
            <div className="vp-card" style={{ textAlign: 'center' }}>
              <img src="/trots-moeder-kind.png" alt="Samen naar de toekomst" style={{ width: '100%', borderRadius: 12, marginBottom: 20 }} />
              <h1 className="vp-h1">Het Vrijheidsplan van {naamWeergave} staat klaar</h1>
              <p className="vp-sub">4 pagina's, met de cijfers, de opbouw per levensfase, en wat er nog ontbreekt tussen dit plan en {naamWeergave} die het zelf leert doen.</p>
              <button className="vp-btn" onClick={() => window.print()}>📄 Download het Vrijheidsplan</button>
              <p style={{ fontFamily: 'Lora, serif', fontStyle: 'italic', fontSize: 13, opacity: 0.6, marginTop: 18, marginBottom: 0 }}>
                Wil je niet wachten? <a href="https://generatiefearless.claudiavoogt.nl/" style={{ color: GF.paars, fontWeight: 700 }}>Bekijk de cursus direct</a>
              </p>
              <div className="vp-nav" style={{ justifyContent: 'center', marginTop: 20 }}>
                <button className="vp-btn-ghost" onClick={vorige}>← Terug naar de cijfers</button>
              </div>
            </div>
          )}
        </div>

        {/* ── PRINT-ONLY PDF LAYOUT (4 pagina's) ── */}
        {results && (
          <div className="vp-print-only">
            <style>{`
              .pg { page-break-after: always; padding: 50px 40px; font-family: 'Lora', serif; color: ${GF.navy}; min-height: 900px; box-sizing: border-box; }
              .pg:last-child { page-break-after: auto; }
              .pg h2 { font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 26px; margin-bottom: 20px; }
              .pg .kop-hero { text-align: center; padding-top: 100px; }
              .pg .rocket-hero { font-size: 110px; }
              .pg .naam-hero { font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 30px; color: ${GF.paars}; margin: 20px 0 8px; }
              .pg .sub-hero { font-style: italic; font-size: 14px; color: ${GF.navy}; }
              .pg .cbox-row { display: flex; gap: 20px; margin: 24px 0; }
              .pg .cbox { flex: 1; padding: 22px; border-radius: 12px; text-align: center; }
              .pg .fase-block { border-left: 4px solid; padding: 12px 16px; margin-bottom: 14px; border-radius: 6px; background: ${GF.smoke}; }
              .pg .actie-block { margin-bottom: 20px; }
              .pg .actie-block h4 { font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 15px; margin-bottom: 6px; color: ${GF.paars}; }
              .vc-report-disclaimer { font-size: 10px; opacity: 0.45; text-align: center; margin-top: 30px; }
            `}</style>

            {/* PDF pagina 1 */}
            <div className="pg kop-hero">
              <div className="rocket-hero">🚀</div>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', color: GF.mint }}>Het Vrijheidsplan van</div>
              <div className="naam-hero">{naamWeergave}</div>
              <div className="sub-hero">Gemaakt op {new Date().toLocaleDateString('nl-NL')}. Een blik op wat tijd en geduld kunnen doen.</div>
              <div style={{ marginTop: 260, fontSize: 14, fontStyle: 'italic', fontWeight: 700, color: GF.fuchsia, maxWidth: 380, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
                Beleggen is geen belofte. Het is <span style={{ color: GF.mint }}>tijd</span>, <span style={{ color: GF.mint }}>geduld</span> en een <span style={{ color: GF.paars }}>voorsprong</span> die maar één keer in het leven van {naamWeergave} zo groot is als nu.
              </div>
            </div>

            {/* PDF pagina 2 */}
            <div className="pg">
              <h2>Dit bouwt {naamWeergave} zelf op</h2>
              <div className="cbox-row">
                <div className="cbox" style={{ background: 'rgba(26,31,54,0.05)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: GF.navy, textTransform: 'uppercase' }}>Als {naamWeergave} spaart</div>
                  <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 24 }}>{eur(gespaard.eindKapitaal)}</div>
                </div>
                <div className="cbox" style={{ background: 'rgba(107,45,132,0.08)', border: `1.5px solid ${GF.paars}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: GF.navy, textTransform: 'uppercase' }}>Als {naamWeergave} belegt</div>
                  <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 24, color: GF.paars }}>{eur(belegd.eindKapitaal)}</div>
                </div>
              </div>
              <div style={{ textAlign: 'center', margin: '24px 0' }}>
                <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 32, color: GF.mint }}>{eur(verschil)}</div>
                <div style={{ fontStyle: 'italic', fontSize: 13, color: GF.navy }}>Dat verschil verdient {naamWeergave} niet met werken. Dat verdient {naamWeergave} met tijd.</div>
              </div>
              <div style={{ fontSize: 11, opacity: 0.5, marginTop: 30 }}>
                Berekend met een gemiddeld rendement van {rend}% per jaar, over {belegd.totaalJaren} jaar. Rendementen uit het verleden bieden geen garantie voor de toekomst.
              </div>
            </div>

            {/* PDF pagina 3 */}
            <div className="pg">
              <h2>Zo bouwt {naamWeergave} het op, stap voor stap</h2>
              {belegd.resultaten.map((r, i) => {
                const context = ['Dit is zakgeld of klusgeld dat ' + naamWeergave + ' opzij zet in plaats van uitgeeft.', naamWeergave + ' heeft een bijbaantje en legt een groter deel opzij.', 'Eerste serieuze baan, serieuzer bedrag.', 'Carrière gemaakt, inkomen op niveau. ' + naamWeergave + ' legt nu fors meer in, met minder moeite dan het ooit kostte.'][i] || '';
                return (
                  <div key={i} className="fase-block" style={{ borderColor: KLEUREN[i % KLEUREN.length] }}>
                    <strong>{r.van} tot {r.tot} jaar, € {r.bedrag}/mnd</strong>
                    <div style={{ fontSize: 13, margin: '4px 0' }}>{context}</div>
                    <div style={{ fontSize: 13 }}>Ingelegd: {eur(r.ingelegd)}. Groeit naar: {eur(r.kapNa)}.</div>
                  </div>
                );
              })}
              {belegd.resultaten.length > 0 && belegd.resultaten[belegd.resultaten.length - 1].tot < doel && (
                <div className="fase-block" style={{ borderColor: GF.mint }}>
                  <strong>{belegd.resultaten[belegd.resultaten.length - 1].tot} tot {doel} jaar, geen inleg meer</strong>
                  <div style={{ fontSize: 13, margin: '4px 0' }}>Vanaf hier doet {naamWeergave} niets meer. Het geld werkt door, vanzelf.</div>
                  <div style={{ fontSize: 13 }}>Groeit naar: {eur(belegd.eindKapitaal)}.</div>
                </div>
              )}
            </div>

            {/* PDF pagina 4 */}
            <div className="pg">
              <h2>Dit plan laat zien wat kan. Niet hoe je het veilig doet.</h2>
              <div className="actie-block">
                <h4>{naamWeergave} gaat dit zelf doen, ooit</h4>
                <p style={{ fontSize: 13, lineHeight: 1.7 }}>Dit plan toont het eindresultaat. Maar hoe leer je je kind verantwoordelijk om te gaan met geld en ook echt de eerste stap zetten naar vermogen opbouwen? Een verkeerd gekozen belegging kan je geld kosten in plaats van geld opleveren.</p>
              </div>
              <div className="actie-block">
                <h4>De wereld van {naamWeergave} praat al over geld, alleen niet op deze manier</h4>
                <p style={{ fontSize: 13, lineHeight: 1.7 }}>TikTok en YouTube staan vol met snel-rijk-worden praatjes, crypto-hypes en beloftes die nergens op slaan. Een tiener die nog geen fundament heeft, is een makkelijk doelwit voor dat soort onzin. Kennis en signalen herkennen is het schild dat jij je kind kunt meegeven. Dat is het wapen tegen die ruis.</p>
              </div>
              <div className="actie-block">
                <h4>Van plan naar gewoonte is de grootste stap</h4>
                <p style={{ fontSize: 13, lineHeight: 1.7 }}>De uitslag in dit rapport motiveert misschien een paar weken. Een kind dat zelf snapt waarom het dit doet, houdt het jaren vol. Dat verschil zit 'm niet in de cijfers, maar in hoe je het uitlegt, op het niveau van een tiener.</p>
              </div>
              <div style={{ background: `linear-gradient(135deg, ${GF.navy}, ${GF.paars})`, color: '#fff', borderRadius: 12, padding: 22, marginTop: 24 }}>
                <img src="/trots-moeder-kind.png" alt="Samen naar de toekomst" style={{ width: '100%', borderRadius: 8, marginBottom: 16 }} />
                <p style={{ fontSize: 13, lineHeight: 1.7, margin: 0 }}>
                  <strong>Generatie Fearless</strong> is de cursus die jij als kind had willen hebben. Geef je kind de financiële voorsprong die jij nooit kreeg. Van hoe je omgaat met geld en inkomsten, het herkennen van financiële onzin op social media, tot het doen van de eerste belegging. De cursus is de manier waarop jij het samen met {naamWeergave} zelf leert doen.
                </p>
                <p style={{ fontSize: 13, lineHeight: 1.7, marginTop: 14, marginBottom: 0 }}>
                  <a href="https://generatiefearless.claudiavoogt.nl/" style={{ color: GF.mint, fontWeight: 700, textDecoration: 'underline' }}>generatiefearless.claudiavoogt.nl</a>
                </p>
              </div>
              <p className="vc-report-disclaimer">
                Gemaakt met het Vrijheidsplan van claudiavoogt.nl, beleggingsexpert &amp; investeringsmentor.
                © {new Date().getFullYear()} Claudia Voogt. Alle rechten voorbehouden.
              </p>
            </div>
          </div>
        )}
      </div>

      <footer className="vc-footer vp-no-print">
        <p className="vc-copy">
          <a href="https://claudiavoogt.nl" target="_blank" rel="noopener noreferrer" style={{ color: '#cdbcd9', textDecoration: 'underline' }}>
            claudiavoogt.nl
          </a>
          {' '}— Beleggingsexpert &amp; investeringsmentor
        </p>
        <p className="vc-copy" style={{ marginTop: 6, color: '#ffffff', opacity: 0.9, fontSize: 11 }}>
          © {new Date().getFullYear()} Claudia Voogt. Alle rechten voorbehouden. Deze tool mag niet worden gedeeld, gekopieerd, nagebouwd of hergebruikt zonder schriftelijke toestemming.
        </p>
      </footer>
    </>
  );
}
