/**
 * Vista RESULTADOS: informe científico interactivo generado a partir de una
 * captura (Snapshot) y su interpretación (Report).
 */
import { buildReport, type Report } from '../analysis/Interpreter';
import type { Snapshot } from '../analysis/Snapshot';
import { buildScenarios } from '../analysis/WhatIf';
import type { LabConfig } from '../ui/Presets';
import { fmtNum, fmtSI } from '../utils/Format';
import { circuitDiagram, ReportChart } from './ReportCharts';

export interface ResultsActions {
  goLab(): void;
  tryConfig(cfg: LabConfig): void;
  example(): void;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const TREND_ICON = { up: '▲', down: '▼', same: '＝', change: '⇄' } as const;
const COMPONENT_ICON: Record<string, string> = {
  resistor: '<svg viewBox="0 0 48 24"><path d="M2 12h8l3-7 6 14 6-14 6 14 6-14 3 7h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  inductor: '<svg viewBox="0 0 48 24"><path d="M2 16h6c0-10 8-10 8 0c0-10 8-10 8 0c0-10 8-10 8 0c0-10 8-10 8 0h6" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  capacitor: '<svg viewBox="0 0 48 24"><path d="M2 12h18M28 12h18M20 3v18M28 3v18" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  source: '<svg viewBox="0 0 48 24"><circle cx="24" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M18 12q3-6 6 0t6 0M2 12h12M34 12h12" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
};

export class ResultsView {
  private snapshots: Snapshot[] = [];
  private current: Snapshot | null = null;
  private report: Report | null = null;
  private charts: ReportChart[] = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly actions: ResultsActions,
  ) {
    this.renderEmpty();
  }

  get hasResults(): boolean {
    return this.current !== null;
  }

  add(snap: Snapshot): void {
    this.snapshots.unshift(snap);
    if (this.snapshots.length > 8) this.snapshots.pop();
    this.show(snap);
  }

  /** Redibuja las gráficas (cambio de tema). */
  refresh(): void {
    for (const c of this.charts) c.draw();
  }

  private show(snap: Snapshot): void {
    this.current = snap;
    this.report = buildReport(snap, buildScenarios(snap.config));
    this.render();
  }

  private renderEmpty(): void {
    this.disposeCharts();
    this.root.innerHTML = `
      <div class="rs-empty">
        <svg viewBox="0 0 120 80" aria-hidden="true"><path d="M6 60h18l6-22 10 40 10-56 10 56 10-40 6 22h38" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>
        <h2>Aún no hay resultados</h2>
        <p>Ejecuta una simulación en el laboratorio y pulsa <b>Obtener resultados</b>. El sistema tomará una «fotografía matemática» del circuito y explicará qué ocurrió, por qué ocurrió y qué pasaría si cambias los parámetros.</p>
        <div class="rs-actions">
          <button class="primary" data-act="lab">Ir al laboratorio</button>
          <button class="ghost" data-act="example">Ver un informe de ejemplo</button>
        </div>
      </div>`;
    this.root.querySelector('[data-act=lab]')!.addEventListener('click', () => this.actions.goLab());
    this.root.querySelector('[data-act=example]')!.addEventListener('click', () => this.actions.example());
  }

  private disposeCharts(): void {
    for (const c of this.charts) c.dispose();
    this.charts = [];
  }

  private render(): void {
    const s = this.current!;
    const r = this.report!;
    const { params, excitation: exc } = s.config;
    this.disposeCharts();
    const when = new Date(s.takenAt).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
    const Etxt = exc.kind === 'step' ? fmtSI(exc.E0, 'V') : exc.kind === 'sine' ? `${fmtNum(exc.E0, 3)} sin(${fmtNum(exc.omega, 3)}t)` : '0';
    const okCount = r.validations.filter((v) => v.ok).length;

    this.root.innerHTML = `
    <div class="rs">
      <header class="rs-hero">
        <div class="rs-kicker">Resultados de la simulación · captura #${s.id} · ${esc(when)}</div>
        <h1>${esc(r.headline)}</h1>
        <p class="rs-sub">${esc(r.subhead)}</p>
        <div class="rs-hero-row">
          <span class="badge ${r.regime}">${esc(r.regimeLabel)}</span>
          <span class="rs-pill ${okCount === r.validations.length ? 'ok' : 'warn'}">${okCount}/${r.validations.length} validaciones superadas</span>
          ${this.snapshots.length > 1 ? `<select class="rs-select" aria-label="Capturas anteriores">${this.snapshots.map((x) => `<option value="${x.id}" ${x.id === s.id ? 'selected' : ''}>Captura #${x.id} · ${esc(new Date(x.takenAt).toLocaleTimeString('es-CO', { timeStyle: 'short' }))}</option>`).join('')}</select>` : ''}
        </div>
        <div class="rs-actions">
          <button class="primary" data-act="lab">← Volver al laboratorio</button>
          <button class="ghost" data-act="retry">Repetir esta configuración</button>
          <button class="ghost" data-act="print">Imprimir / PDF</button>
        </div>
      </header>

      <section class="rs-kpis">
        ${r.kpis.map((k) => `<div class="rs-kpi tone-${k.tone}"><span>${esc(k.label)}</span><b>${esc(k.value)}</b><small>${esc(k.hint)}</small></div>`).join('')}
      </section>

      <section class="rs-grid charts">
        <figure class="rs-card"><figcaption>Respuesta en el tiempo</figcaption><div class="chart"><canvas data-chart="time"></canvas></div></figure>
        <figure class="rs-card"><figcaption>Intercambio de energía almacenada</figcaption><div class="chart"><canvas data-chart="energy"></canvas></div></figure>
        <figure class="rs-card"><figcaption>Retrato de fase (q, i)</figcaption><div class="chart"><canvas data-chart="phase"></canvas></div></figure>
      </section>

      <section class="rs-grid two">
        <article class="rs-card">
          <h2><span class="rs-step">1</span> Lo que configuramos</h2>
          ${circuitDiagram(fmtSI(params.R, 'Ω'), fmtSI(params.L, 'H'), fmtSI(params.C, 'F'), Etxt, exc.kind)}
          ${r.configured.map((p) => `<p>${esc(p)}</p>`).join('')}
        </article>
        <article class="rs-card">
          <h2><span class="rs-step">2</span> Lo que observamos</h2>
          ${r.observed.map((p) => `<p>${esc(p)}</p>`).join('')}
        </article>
      </section>

      <section class="rs-card">
        <h2>Configuración inicial vs. resultado</h2>
        <div class="rs-compare">
          <div class="rs-compare-head"><span>Magnitud</span><span>t = 0</span><span></span><span>t = ${fmtNum(s.final.t, 4)} s</span></div>
          ${r.comparison
            .map((c) => {
              const delta = c.final - c.initial;
              const dir = Math.abs(delta) < 1e-12 * Math.max(Math.abs(c.initial), Math.abs(c.final), 1e-12) ? 'same' : delta > 0 ? 'up' : 'down';
              return `<div class="rs-compare-row tone-${c.tone}"><span>${esc(c.label)}</span><span class="mono">${fmtSI(c.initial, c.unit)}</span><span class="rs-trend ${dir}">${TREND_ICON[dir]}</span><span class="mono strong">${fmtSI(c.final, c.unit)}</span></div>`;
            })
            .join('')}
        </div>
        <ul class="rs-changes">${r.changes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
      </section>

      <section class="rs-card">
        <h2>Validación: RK4 frente a la teoría</h2>
        <p class="note">Las mismas mediciones se repiten sobre la solución analítica exacta. Si coinciden, el método numérico y el modelo son consistentes.</p>
        <div class="rs-valid">
          ${r.validations
            .map(
              (v) => `<div class="rs-valid-row ${v.ok ? 'ok' : 'bad'}">
                <span class="rs-check" aria-label="${v.ok ? 'correcto' : 'revisar'}">${v.ok ? '✓' : '!'}</span>
                <div><b>${esc(v.label)}</b><small>${esc(v.note)}</small></div>
                <div class="mono"><span class="dim">medido</span> ${esc(v.measured)}</div>
                <div class="mono"><span class="dim">teórico</span> ${esc(v.theoretical)}</div>
              </div>`,
            )
            .join('')}
        </div>
      </section>

      <section>
        <h2 class="rs-section-title">Análisis por componente</h2>
        <div class="rs-grid comps">
          ${r.components
            .map(
              (c) => `<article class="rs-card rs-comp comp-${c.id}">
                <header><span class="rs-icon">${COMPONENT_ICON[c.id]}</span><h3>${esc(c.title)} <em>${c.symbol}</em></h3></header>
                <dl>${c.metrics.map((m) => `<div><dt>${esc(m.label)}</dt><dd>${esc(m.value)}</dd></div>`).join('')}</dl>
                ${c.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
              </article>`,
            )
            .join('')}
        </div>
      </section>

      <section>
        <h2 class="rs-section-title"><span class="rs-step">3</span> Lo que pasaría si…</h2>
        <p class="note">Cada escenario se calculó resolviendo de nuevo la ecuación con el parámetro modificado; no es una regla general sino el resultado numérico para tu circuito.</p>
        <div class="rs-grid whatif">
          ${r.whatIf
            .map(
              (w, k) => `<article class="rs-card rs-whatif ${w.regimeChanged ? 'changed' : ''}">
                <header><h3>${esc(w.title)}</h3><span class="mono">${esc(w.change)}</span></header>
                <ul>${w.effects.map((e) => `<li><span>${esc(e.label)}</span><span class="mono">${esc(e.from)}</span><span class="rs-trend ${e.trend}">${TREND_ICON[e.trend]}</span><span class="mono strong">${esc(e.to)}</span></li>`).join('')}</ul>
                <p>${esc(w.text)}</p>
                <button class="ghost small" data-try="${k}">Probar en el laboratorio →</button>
              </article>`,
            )
            .join('')}
        </div>
      </section>

      <section class="rs-card">
        <h2>Conclusión del sistema completo</h2>
        <div class="rs-qa">
          ${r.conclusion.map((c, k) => `<details ${k < 3 ? 'open' : ''}><summary>${esc(c.q)}</summary><p>${esc(c.a)}</p></details>`).join('')}
        </div>
      </section>

      <footer class="rs-foot">Informe generado automáticamente a partir de los datos de la simulación: cada frase depende de los valores medidos o calculados. RK4 con paso h = ${fmtSI(s.h, 's')}; validación contra la solución analítica exacta.</footer>
    </div>`;

    this.root.querySelectorAll<HTMLCanvasElement>('canvas[data-chart]').forEach((cv) => {
      const chart = new ReportChart(cv, cv.dataset.chart as 'time' | 'energy' | 'phase');
      chart.setData(s.series, exc.kind === 'step' ? params.C * exc.E0 : 0);
      this.charts.push(chart);
    });
    const on = (sel: string, fn: () => void) => this.root.querySelector(sel)?.addEventListener('click', fn);
    on('[data-act=lab]', () => this.actions.goLab());
    on('[data-act=retry]', () => this.actions.tryConfig(s.config));
    on('[data-act=print]', () => window.print());
    this.root.querySelector<HTMLSelectElement>('.rs-select')?.addEventListener('change', (e) => {
      const id = Number((e.target as HTMLSelectElement).value);
      const snap = this.snapshots.find((x) => x.id === id);
      if (snap) this.show(snap);
    });
    const scenarios = r.whatIf;
    this.root.querySelectorAll<HTMLButtonElement>('[data-try]').forEach((b) =>
      b.addEventListener('click', () => {
        const w = scenarios[Number(b.dataset.try)];
        const sc = buildScenarios(s.config).find((x) => x.id === w.id);
        if (sc) this.actions.tryConfig(sc.config);
      }),
    );
    this.root.scrollTop = 0;
    this.root.parentElement?.scrollTo?.({ top: 0 });
  }
}
