(() => {
  const data = window.TAIJIAN_SIM;
  const mc = data.monte_carlo;
  const oasis = data.oasis || {};
  const panel = data.panel || {};
  const local = data.mirofish_local || {};
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const NS = 'http://www.w3.org/2000/svg';
  const fmt = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });
  const money = (value) => {
    const n = Number(value || 0);
    if (Math.abs(n) >= 1000000) return `NT$${(n / 1000000).toFixed(2)}M`;
    if (Math.abs(n) >= 1000) return `NT$${(n / 1000).toFixed(0)}k`;
    return `NT$${fmt.format(n)}`;
  };
  const num = (value) => fmt.format(Number(value || 0));
  const pct = (value) => `${(Number(value || 0) * 100).toFixed(1)}%`;

  function node(tag, attrs = {}, parent = null) {
    const element = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
    if (parent) parent.appendChild(element);
    return element;
  }

  function svgRoot(container, height = 260) {
    const width = 760;
    const svg = node('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img' });
    container.replaceChildren(svg);
    return { svg, width, height };
  }

  function rangeChart(container) {
    const scenarios = ['conservative', 'base', 'upside'];
    const labels = { conservative: '保守', base: '基準', upside: '樂觀' };
    const { svg, width, height } = svgRoot(container, 250);
    const margin = { left: 54, right: 20, top: 22, bottom: 38 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const values = scenarios.flatMap((name) => [
      mc.scenario_summaries[name].mrr_m12.p10,
      mc.scenario_summaries[name].mrr_m12.p90,
    ]);
    const max = Math.max(...values) * 1.15;
    for (let i = 0; i <= 4; i++) {
      const y = margin.top + (plotH * i) / 4;
      node('line', { x1: margin.left, x2: width - margin.right, y1: y, y2: y, class: 'gridline' }, svg);
      const label = node('text', { x: margin.left - 8, y: y + 4, 'text-anchor': 'end', fill: '#7d766a', 'font-size': 10 }, svg);
      label.textContent = money(max * (1 - i / 4));
    }
    const band = plotW / scenarios.length;
    scenarios.forEach((name, index) => {
      const item = mc.scenario_summaries[name].mrr_m12;
      const x = margin.left + band * index + band * 0.3;
      const y10 = margin.top + plotH * (1 - item.p10 / max);
      const y90 = margin.top + plotH * (1 - item.p90 / max);
      const y50 = margin.top + plotH * (1 - item.p50 / max);
      node('rect', {
        x, y: y90, width: band * 0.4, height: Math.max(2, y10 - y90),
        rx: 8, fill: index === 1 ? '#3f6b4f' : '#a8b9a5', opacity: index === 1 ? .92 : .64,
      }, svg);
      node('circle', { cx: x + band * 0.2, cy: y50, r: 5, fill: '#c8794d', stroke: '#fffdf8', 'stroke-width': 2 }, svg);
      const xLabel = node('text', { x: x + band * 0.2, y: height - 15, 'text-anchor': 'middle', fill: '#445348', 'font-size': 11, 'font-weight': 700 }, svg);
      xLabel.textContent = labels[name];
      const p = node('text', { x: x + band * 0.2, y: y50 - 11, 'text-anchor': 'middle', fill: '#8a4e2d', 'font-size': 10, 'font-weight': 800 }, svg);
      p.textContent = money(item.p50);
    });
    const caption = node('text', { x: margin.left, y: 12, fill: '#7d766a', 'font-size': 10 }, svg);
    caption.textContent = '第 12 個月 MRR：P10–P90 區間，橘點為 P50';
  }

  function histogram(container, histogram, title, p50Value) {
    const { svg, width, height } = svgRoot(container, 230);
    const margin = { left: 44, right: 16, top: 18, bottom: 34 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const counts = histogram.counts;
    const max = Math.max(...counts) * 1.1;
    const barW = plotW / counts.length;
    counts.forEach((count, index) => {
      const h = plotH * (count / max);
      const x = margin.left + index * barW;
      const rect = node('rect', {
        x: x + 1, y: margin.top + plotH - h, width: Math.max(1, barW - 2), height: h,
        rx: 3, fill: index > counts.length * .65 ? '#c8794d' : '#6f9273', opacity: .82,
      }, svg);
      const titleNode = node('title', {}, rect);
      titleNode.textContent = `${money(histogram.bins[index])} – ${money(histogram.bins[index] + histogram.width)}：${count} 次`;
    });
    const p50 = p50Value;
    const min = histogram.bins[0];
    const maxBin = histogram.bins[histogram.bins.length - 1] + histogram.width;
    const px = margin.left + ((p50 - min) / (maxBin - min)) * plotW;
    node('line', { x1: px, x2: px, y1: margin.top, y2: margin.top + plotH, stroke: '#8a4e2d', 'stroke-width': 1.5, 'stroke-dasharray': '4 4' }, svg);
    const pLabel = node('text', { x: Math.min(width - 14, px + 4), y: margin.top + 11, 'text-anchor': px > width - 120 ? 'end' : 'start', fill: '#8a4e2d', 'font-size': 10, 'font-weight': 800 }, svg);
    pLabel.textContent = `P50 ${money(p50)}`;
    [0, Math.floor(counts.length / 2), counts.length - 1].forEach((index) => {
      const label = node('text', { x: margin.left + index * barW + barW / 2, y: height - 12, 'text-anchor': 'middle', fill: '#7d766a', 'font-size': 9 }, svg);
      label.textContent = money(histogram.bins[index]);
    });
    const yLabel = node('text', { x: 4, y: margin.top + 4, fill: '#7d766a', 'font-size': 9 }, svg);
    yLabel.textContent = title;
  }

  function tornado(container) {
    const rows = (mc.sensitivity || []).slice(0, 6);
    const labels = {
      reach_12m: '12 個月觸及率',
      trial_rate: '試用轉換率',
      paid_rate: '試用轉付費率',
      reptile_households: '爬蟲飼養家戶',
      arpu: '每月客單價',
      monthly_churn: '月流失率',
      cac_per_paid: '每付費客 CAC',
      fixed_cost_monthly: '每月固定成本',
      digital_share: '數位可觸及比例',
    };
    const { svg, width, height } = svgRoot(container, 280);
    const margin = { left: 138, right: 24, top: 18, bottom: 22 };
    const plotW = width - margin.left - margin.right;
    const rowH = (height - margin.top - margin.bottom) / rows.length;
    const max = Math.max(...rows.map((row) => Math.max(row.low_revenue_12m, row.high_revenue_12m))) * 1.05;
    const center = margin.left + plotW * 0.35;
    rows.forEach((row, index) => {
      const y = margin.top + index * rowH + rowH * 0.2;
      const lowW = (row.low_revenue_12m / max) * (plotW * 0.55);
      const highW = (row.high_revenue_12m / max) * (plotW * 0.55);
      node('rect', { x: center - lowW, y, width: lowW, height: rowH * 0.45, rx: 3, fill: '#c8794d', opacity: .66 }, svg);
      node('rect', { x: center, y: y + rowH * 0.38, width: highW, height: rowH * 0.45, rx: 3, fill: '#3f6b4f', opacity: .72 }, svg);
      const label = node('text', { x: margin.left - 10, y: y + 13, 'text-anchor': 'end', fill: '#445348', 'font-size': 10, 'font-weight': 700 }, svg);
      label.textContent = labels[row.variable] || row.variable;
      const low = node('text', { x: center - lowW - 4, y: y + 10, 'text-anchor': 'end', fill: '#8a4e2d', 'font-size': 9 }, svg);
      low.textContent = money(row.low_revenue_12m);
      const high = node('text', { x: center + highW + 4, y: y + rowH * 0.38 + 10, fill: '#315c3d', 'font-size': 9 }, svg);
      high.textContent = money(row.high_revenue_12m);
    });
    node('line', { x1: center, x2: center, y1: margin.top, y2: height - margin.bottom, stroke: '#445348', 'stroke-width': 1, 'stroke-dasharray': '2 4' }, svg);
  }

  function activeChart(container) {
    const curve = mc.base_retention_curve || [];
    const { svg, width, height } = svgRoot(container, 230);
    const margin = { left: 44, right: 16, top: 18, bottom: 32 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const max = Math.max(...curve.map((item) => item.p90)) * 1.1;
    const x = (index) => margin.left + (plotW * index) / Math.max(1, curve.length - 1);
    const y = (value) => margin.top + plotH * (1 - value / max);
    [0, .5, 1].forEach((fraction) => {
      const yy = margin.top + plotH * (1 - fraction);
      node('line', { x1: margin.left, x2: width - margin.right, y1: yy, y2: yy, class: 'gridline' }, svg);
      const label = node('text', { x: margin.left - 8, y: yy + 4, 'text-anchor': 'end', fill: '#7d766a', 'font-size': 9 }, svg);
      label.textContent = num(max * fraction);
    });
    [['p10', '#c8794d'], ['p50', '#3f6b4f'], ['p90', '#6f9273']].forEach(([key, color]) => {
      const points = curve.map((item, index) => `${x(index)},${y(item[key])}`).join(' ');
      node('polyline', { points, fill: 'none', stroke: color, 'stroke-width': key === 'p50' ? 2.5 : 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: key === 'p50' ? 1 : .65 }, svg);
    });
    curve.forEach((item, index) => {
      if (index % 2 === 0 || index === curve.length - 1) {
        const label = node('text', { x: x(index), y: height - 10, 'text-anchor': 'middle', fill: '#7d766a', 'font-size': 9 }, svg);
        label.textContent = `${index + 1}月`;
      }
    });
    const legend = document.createElement('div');
    legend.className = 'legend';
    legend.innerHTML = '<span><i style="background:#c8794d"></i>P10</span><span><i style="background:#3f6b4f"></i>P50</span><span><i style="background:#6f9273"></i>P90</span><span>付費會員數（月末）</span>';
    container.appendChild(legend);
  }

  function retentionChart(container) {
    const rows = mc.retention || [];
    const { svg, width, height } = svgRoot(container, 230);
    const margin = { left: 42, right: 18, top: 18, bottom: 32 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const maxMonth = 24;
    const x = (month) => margin.left + (plotW * month) / maxMonth;
    const y = (value) => margin.top + plotH * (1 - value);
    [0, .25, .5, .75, 1].forEach((value) => {
      const yy = y(value);
      node('line', { x1: margin.left, x2: width - margin.right, y1: yy, y2: yy, class: 'gridline' }, svg);
      const label = node('text', { x: margin.left - 8, y: yy + 4, 'text-anchor': 'end', fill: '#7d766a', 'font-size': 9 }, svg);
      label.textContent = `${Math.round(value * 100)}%`;
    });
    const colors = ['#3f6b4f', '#c8794d', '#6f9273'];
    rows.forEach((row, index) => {
      const points = [];
      for (let month = 0; month <= maxMonth; month++) {
        points.push(`${x(month)},${y(Math.pow(1 - row.monthly_churn, month))}`);
      }
      node('polyline', { points: points.join(' '), fill: 'none', stroke: colors[index], 'stroke-width': 2, 'stroke-linecap': 'round' }, svg);
      const label = node('text', { x: width - margin.right, y: y(row.m24) + (index - 1) * 11, 'text-anchor': 'end', fill: colors[index], 'font-size': 9, 'font-weight': 700 }, svg);
      label.textContent = `月流失 ${(row.monthly_churn * 100).toFixed(1)}%`;
    });
    [0, 6, 12, 18, 24].forEach((month) => {
      const label = node('text', { x: x(month), y: height - 10, 'text-anchor': 'middle', fill: '#7d766a', 'font-size': 9 }, svg);
      label.textContent = `${month}月`;
    });
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function fillKPIs() {
    const base = mc.scenario_summaries.base;
    setText('kpi-mrr', money(base.mrr_m12.p50));
    setText('kpi-active', num(base.active_m12.p50));
    setText('kpi-revenue', money(base.revenue_12m.p50));
    setText('kpi-profit', pct(base.probability_profitable));
    setText('kpi-revenue-note', `P10 ${money(base.revenue_12m.p10)} · P90 ${money(base.revenue_12m.p90)}`);
    setText('kpi-mrr-note', `P10 ${money(base.mrr_m12.p10)} · P90 ${money(base.mrr_m12.p90)}`);
    setText('kpi-active-note', `P10 ${num(base.active_m12.p10)} · P90 ${num(base.active_m12.p90)}`);
    setText('kpi-profit-note', '基準情境下 12 個月內轉正的機率');
  }

  function fillScenarioTable() {
    const body = document.getElementById('scenario-body');
    if (!body) return;
    const names = { conservative: '保守', base: '基準', upside: '樂觀', commercial: '已商轉', appstore: 'App Store' };
    body.innerHTML = ['conservative', 'base', 'upside', 'commercial', 'appstore'].map((name) => {
      const s = mc.scenario_summaries[name];
      return `<tr><td><strong>${names[name]}</strong></td><td class="num">${money(s.mrr_m12.p50)}</td><td class="num">${num(s.active_m12.p50)}</td><td class="num">${money(s.revenue_12m.p50)}</td><td class="num">${pct(s.probability_profitable)}</td><td class="num">${s.ltv_cac.p50.toFixed(1)}×</td></tr>`;
    }).join('');
  }

  function fillFacts() {
    setText('iterations', num(mc.meta.iterations_per_scenario * 5));
  }

  function fillFutureKPIs() {
    const labels = { commercial: 'commercial', appstore: 'appstore' };
    for (const [name, prefix] of Object.entries(labels)) {
      const s = mc.scenario_summaries[name];
      setText(`future-${prefix}-mrr`, money(s.mrr_m12.p50));
      setText(`future-${prefix}-active`, num(s.active_m12.p50));
      setText(`future-${prefix}-revenue`, money(s.revenue_12m.p50));
      setText(`future-${prefix}-profit`, pct(s.probability_profitable));
    }
  }

  function futureRangeChart(container) {
    const scenarios = ['conservative', 'base', 'upside', 'commercial', 'appstore'];
    const labels = { conservative: '保守', base: '基準', upside: '樂觀', commercial: '已商轉', appstore: 'App Store' };
    const { svg, width, height } = svgRoot(container, 270);
    const margin = { left: 60, right: 20, top: 22, bottom: 38 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const values = scenarios.flatMap((name) => [mc.scenario_summaries[name].mrr_m12.p10, mc.scenario_summaries[name].mrr_m12.p90]);
    const max = Math.max(...values) * 1.12;
    for (let i = 0; i <= 4; i++) {
      const y = margin.top + (plotH * i) / 4;
      node('line', { x1: margin.left, x2: width - margin.right, y1: y, y2: y, class: 'gridline' }, svg);
      const label = node('text', { x: margin.left - 8, y: y + 4, 'text-anchor': 'end', fill: '#7d766a', 'font-size': 9 }, svg);
      label.textContent = money(max * (1 - i / 4));
    }
    const band = plotW / scenarios.length;
    scenarios.forEach((name, index) => {
      const item = mc.scenario_summaries[name].mrr_m12;
      const x = margin.left + band * index + band * 0.25;
      const y10 = margin.top + plotH * (1 - item.p10 / max);
      const y90 = margin.top + plotH * (1 - item.p90 / max);
      const y50 = margin.top + plotH * (1 - item.p50 / max);
      const counterfactual = index >= 3;
      node('rect', { x, y: y90, width: band * 0.5, height: Math.max(2, y10 - y90), rx: 7, fill: counterfactual ? '#c8794d' : '#6f9273', opacity: counterfactual ? .72 : .72 }, svg);
      node('circle', { cx: x + band * 0.25, cy: y50, r: 4.5, fill: '#fffdf8', stroke: '#8a4e2d', 'stroke-width': 2 }, svg);
      const xLabel = node('text', { x: x + band * 0.25, y: height - 14, 'text-anchor': 'middle', fill: '#445348', 'font-size': 9, 'font-weight': 700 }, svg);
      xLabel.textContent = labels[name];
      const p = node('text', { x: x + band * 0.25, y: y50 - 10, 'text-anchor': 'middle', fill: '#8a4e2d', 'font-size': 9, 'font-weight': 800 }, svg);
      p.textContent = money(item.p50);
    });
  }

  function renderOasis() {
    const container = document.getElementById('oasis-content');
    if (!container) return;
    if (oasis.status !== 'completed') {
      container.innerHTML = `<div class="callout"><strong>MiroFish/OASIS 尚未完成</strong>${oasis.note || '此區會在模擬完成後更新。'}</div>`;
      return;
    }
    const counts = oasis.counts || {};
    const themes = oasis.themes || [];
    container.innerHTML = `
      <div class="grid grid-3">
        <div class="card kpi"><div class="label">AGENTS</div><div class="value">${num(oasis.agents)}</div><div class="note">${oasis.rounds} 輪、12 個台灣爬蟲/特寵 persona</div></div>
        <div class="card kpi"><div class="label">SOCIAL ACTIONS</div><div class="value">${num(oasis.actions)}</div><div class="note">發文 ${num(counts.posts || 0)} · 留言 ${num(counts.comments || 0)} · 讚 ${num(counts.likes || 0)} · 追蹤 ${num(counts.follows || 0)}</div></div>
        <div class="card kpi"><div class="label">ADOPTION SIGNAL</div><div class="value">${oasis.adoption_signal || '—'}</div><div class="note">不是購買意願預測，只是質性訊號</div></div>
      </div>
      <div class="quote-grid" style="margin-top:16px">
        ${themes.map((theme) => `<div class="quote"><p>${escape(theme.text)}</p><cite>${escape(theme.agent || 'OASIS persona')}</cite></div>`).join('')}
      </div>
      <p class="small" style="margin-top:14px">${oasis.method_note || ''}</p>
    `;
  }

  function renderMirofishLocal() {
    const container = document.getElementById('mirofish-local-content');
    if (!container) return;
    const summary = local.summary || {};
    if (summary.status !== 'completed') {
      container.innerHTML = `<div class="callout"><strong>MiroFish-Local 部分打通，但 simulation 尚未成為市場證據</strong>${escape(summary.reason || '尚未完成。')}<br><br><span class="small">${escape((summary.completed_checks || []).join(' · '))}</span></div>`;
      return;
    }
    const reportEnvelope = local.report || {};
    const report = reportEnvelope.data || reportEnvelope;
    const reportText = report.markdown_content || report.markdownContent || report.report || report.content || report.markdown || report.summary || '';
    container.innerHTML = `
      <div class="grid grid-3">
        <div class="card kpi"><div class="label">GRAPHITI + NEO4J</div><div class="value">完整</div><div class="note">沒有 Zep Cloud key</div></div>
        <div class="card kpi"><div class="label">GRAPH ID</div><div class="value" style="font-size:18px;font-family:var(--mono);word-break:break-all">${escape(summary.graph_id || '—')}</div><div class="note">本地圖譜</div></div>
        <div class="card kpi"><div class="label">SIMULATION ID</div><div class="value" style="font-size:18px;font-family:var(--mono);word-break:break-all">${escape(summary.simulation_id || '—')}</div><div class="note">OASIS 2 rounds</div></div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="kicker">ReportAgent output</div>
        <p class="small">完整 GraphRAG pipeline 的報告摘要（原始 JSON 在 <code>simulations/results/mirofish_report.json</code>）。</p>
        <div style="white-space:pre-wrap; line-height:1.7; font-size:13px">${escape(reportText).slice(0, 12000) || '報告 JSON 已保存，尚無可顯示的 markdown 欄位。'}</div>
      </div>
    `;
  }

  function renderPanel() {
    const container = document.getElementById('panel-content');
    if (!container) return;
    const summary = panel.summary || {};
    if (summary.status !== 'completed') {
      container.innerHTML = `<div class="callout" style="grid-column:1/-1"><strong>Persona panel 尚未完成</strong>${escape(summary.note || '等待 THU LLM 回應。')}</div>`;
      return;
    }
    const responses = (panel.responses || []).filter((row) => row.agent_id !== 0 && row.answer && row.answer.interest);
    const plans = summary.plans || {};
    container.innerHTML = `
      <div class="card" style="grid-column:1/-1">
        <div class="kicker">Synthetic panel · n=${summary.customer_n || summary.n} 位顧客 persona（官方 seed 已排除）</div>
        <div class="grid grid-4" style="margin-top:10px">
          <div><span class="small">平均興趣</span><div class="value" style="font-size:28px;font-weight:900">${summary.mean_interest ?? '—'} / 5</div></div>
          <div><span class="small">平均試用機率</span><div class="value" style="font-size:28px;font-weight:900">${summary.mean_trial_likelihood == null ? '—' : Math.round(summary.mean_trial_likelihood * 100) + '%'}</div></div>
          <div><span class="small">平均付費機率</span><div class="value" style="font-size:28px;font-weight:900">${summary.mean_pay_likelihood == null ? '—' : Math.round(summary.mean_pay_likelihood * 100) + '%'}</div></div>
          <div><span class="small">價格中位數</span><div class="value" style="font-size:28px;font-weight:900">${summary.median_max_price == null ? '—' : 'NT$' + num(summary.median_max_price)}</div></div>
        </div>
        <p class="small" style="margin:10px 0 0">偏好方案：免費 ${plans.free || 0} · 99 ${plans['99'] || 0} · 199 ${plans['199'] || 0} · 399 ${plans['399'] || 0} · 不確定 ${plans.unsure || 0}。這是合成資料，不是代表性調查。</p>
      </div>
      ${responses.map((row) => `<div class="quote"><div class="small">${escape(row.name)} · 興趣 ${row.answer.interest}/5 · 付費 ${Math.round((row.answer.pay_likelihood || 0) * 100)}%</div><p style="margin-top:8px">「${escape(row.answer.quote)}」</p><p class="small" style="margin-top:8px"><strong>必要：</strong>${escape(row.answer.must_have)}<br><strong>疑慮：</strong>${escape(row.answer.biggest_concern)}</p></div>`).join('')}
    `;
  }

  function initCalculator() {
    const ids = ['households', 'reach', 'trial', 'paid', 'arpu', 'churn'];
    const defaults = {
      households: 225000, reach: 20, trial: 14, paid: 29, arpu: 179, churn: 5.5,
    };
    const read = () => {
      const out = {};
      ids.forEach((id) => {
        const element = document.getElementById(`calc-${id}`);
        out[id] = Number(element?.value ?? defaults[id]);
        const label = document.getElementById(`calc-${id}-out`);
        if (label) label.textContent = id === 'households' ? num(out[id]) : id === 'arpu' ? `NT$${num(out[id])}` : `${out[id]}%`;
      });
      return out;
    };
    const draw = () => {
      const v = read();
      const totalReached = v.households * 0.45 * (v.reach / 100);
      const trials = totalReached * (v.trial / 100);
      const paidTotal = trials * (v.paid / 100);
      let active = 0;
      let revenue = 0;
      const churn = v.churn / 100;
      const ramp = [0.55, 0.65, 0.8, 0.95, 1.05, 1.1, 1.15, 1.2, 1.2, 1.25, 1.25, 1.25];
      const weight = ramp.reduce((a, b) => a + b, 0);
      for (let month = 0; month < 12; month++) {
        active = active * (1 - churn) + paidTotal * ramp[month] / weight;
        revenue += active * v.arpu;
      }
      setText('calc-active', num(active));
      setText('calc-mrr', money(active * v.arpu));
      setText('calc-revenue', money(revenue));
      setText('calc-trials', num(trials));
    };
    ids.forEach((id) => {
      const element = document.getElementById(`calc-${id}`);
      if (element) element.addEventListener('input', draw);
    });
    draw();
  }

  fillKPIs();
  fillScenarioTable();
  fillFacts();
  fillFutureKPIs();
  rangeChart(document.getElementById('chart-range'));
  futureRangeChart(document.getElementById('chart-future-range'));
  histogram(document.getElementById('chart-hist-revenue'), mc.base_histograms.revenue_12m, '12 個月收入', mc.scenario_summaries.base.revenue_12m.p50);
  histogram(document.getElementById('chart-hist-mrr'), mc.base_histograms.mrr_m12, 'MRR', mc.scenario_summaries.base.mrr_m12.p50);
  tornado(document.getElementById('chart-tornado'));
  activeChart(document.getElementById('chart-active'));
  retentionChart(document.getElementById('chart-retention'));
  renderOasis();
  renderMirofishLocal();
  renderPanel();
  initCalculator();
})();
