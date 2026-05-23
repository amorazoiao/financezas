// =============================================================================
// dashboard.js — Dashboard principal, gráficos, métricas e histórico
// =============================================================================
// Depende de: utils.js, storage.js, dialogs.js
// =============================================================================

/**
 * Categorias consideradas essenciais para o cálculo da análise do mês.
 * @constant {string[]}
 */
const CATEGORIAS_ESSENCIAIS = ['Alimentação', 'Moradia', 'Saúde', 'Educação', 'Contas', 'Transporte'];

/**
 * Paleta semântica: cada categoria tem cor fixa em todos os gráficos.
 * @constant {Object.<string, string>}
 */
const CATEGORY_COLORS = {
  'Salário':          '#1D9E75',
  'Freelance':        '#0F6E56',
  'Investimentos':    '#185FA5',
  'Presentes':        '#D4537E',
  'Alimentação':      '#EF9F27',
  'Moradia':          '#BA7517',
  'Transporte':       '#378ADD',
  'Saúde':            '#2ED573',
  'Educação':         '#534AB7',
  'Contas':           '#888780',
  'Lazer':            '#D85A30',
  'Outros':           '#B4B2A9',
  'Pagamento Fatura': '#5F5E5A',
  'Reserva':          '#97C459',
};
const FALLBACK_COLORS = ['#A55EEA','#FF6B81','#00CED1','#FF9800','#70A1FF','#FF69B4','#7FDBFF','#01FF70'];

function getCategoriaColor(categoria) {
  if (CATEGORY_COLORS[categoria]) return CATEGORY_COLORS[categoria];
  let hash = 0;
  for (let i = 0; i < categoria.length; i++) hash = (hash * 31 + categoria.charCodeAt(i)) | 0;
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

function getCategoriaColorAlpha(categoria, alpha = 0.15) {
  const hex = getCategoriaColor(categoria);
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Paleta de cores para o gráfico de distribuição (doughnut).
 * Mantida para compatibilidade; prefer getCategoriaColor().
 * @constant {string[]}
 */
const CHART_COLORS = Object.values(CATEGORY_COLORS);

// ---------- Estado do mês selecionado no dashboard ----------
/** @type {number} Mês (0-11) selecionado no dashboard. */
let dashMes = new Date().getMonth();
/** @type {number} Ano selecionado no dashboard. */
let dashAno = new Date().getFullYear();

/**
 * Navega o dashboard para o mês anterior ou próximo.
 * @param {-1|1} dir - Direção da navegação: -1 para anterior, 1 para próximo.
 */
function dashNavMes(dir) {
  dashMes += dir;
  if (dashMes < 0) { dashMes = 11; dashAno--; }
  if (dashMes > 11) { dashMes = 0; dashAno++; }
  atualizarDashboard();
}

// ---------- Linha 1 — Saldo atual, previsto, economia ----------

/**
 * Renderiza os três cards de saldo da Linha 1.
 * @private
 */
function _renderLinha1() {
  const mes = new Date().getMonth();
  const ano = new Date().getFullYear();

  // Saldo atual
  const saldo = calcularSaldoReal();
  const elSaldo = document.getElementById('hero-balance');
  if (elSaldo) {
    elSaldo.textContent = formatMoney(saldo);
    elSaldo.style.color = saldo < 0 ? '#ff6b6b' : '';
  }

  // Receitas e despesas do mês corrente
  const recMes = lancamentos
    .filter(l => { const d = parseLocalDate(l.data); return l.valor > 0 && l.tipo !== 'pagamento_fatura' && d.getMonth() === mes && d.getFullYear() === ano; })
    .reduce((s, l) => s + l.valor, 0);
  const despMes = lancamentos
    .filter(l => { const d = parseLocalDate(l.data); return l.valor < 0 && l.tipo === 'despesa_avista' && d.getMonth() === mes && d.getFullYear() === ano; })
    .reduce((s, l) => s + Math.abs(l.valor), 0) + _somarParcelasDoMes(mes, ano);

  const elRec  = document.getElementById('hero-receitas');
  const elDesp = document.getElementById('hero-despesas');
  if (elRec)  elRec.textContent  = formatMoney(recMes);
  if (elDesp) elDesp.textContent = formatMoney(despMes);

  // Saldo previsto (saldo atual + recorrências do próximo ciclo)
  const recFixas  = recorrencias.filter(r => r.ativo && r.valor > 0).reduce((s, r) => s + r.valor, 0);
  const despFixas = recorrencias.filter(r => r.ativo && r.valor < 0).reduce((s, r) => s + Math.abs(r.valor), 0);
  const previsto  = saldo + recFixas - despFixas;
  const elPrev = document.getElementById('db-saldo-previsto');
  if (elPrev) {
    elPrev.textContent = formatMoney(previsto);
    elPrev.style.color = previsto < 0 ? '#dc2626' : '';
  }

  // Economia do mês
  const economia = recMes - despMes;
  const taxa     = recMes > 0 ? ((economia / recMes) * 100).toFixed(1) : 0;
  const elEcon   = document.getElementById('db-economia');
  const elTaxa   = document.getElementById('db-taxa-poupanca');
  if (elEcon) {
    elEcon.textContent = formatMoney(Math.abs(economia));
    elEcon.style.color = economia < 0 ? '#dc2626' : '';
  }
  if (elTaxa) elTaxa.textContent = economia >= 0
    ? `${taxa}% da renda poupada`
    : `${Math.abs(taxa)}% acima da renda`;
}

// ---------- Label do mês no gráfico ----------
function _atualizarChartMesLabel() {
  const el = document.getElementById('db-chart-mes-label');
  if (el) el.textContent = `${mesesNomes[dashMes].substring(0,3)} ${dashAno}`;
}

// ---------- Linha 3 — Categorias, Cartões, Orçamentos ----------

/**
 * Renderiza os três mini-cards da Linha 3.
 * @private
 */
function _renderLinha3() {
  _renderMiniCategorias();
  _renderMiniCartoes();
  _renderMiniOrcamentos();
}

/** @private Top-4 categorias de despesa do mês */
function _renderMiniCategorias() {
  const container = document.getElementById('db-categorias-lista');
  if (!container) return;

  const gastos = _calcularGastosPorCategoria(dashMes, dashAno);
  const total  = Object.values(gastos).reduce((s, v) => s + v, 0);
  const top    = Object.entries(gastos).sort((a, b) => b[1] - a[1]).slice(0, 4);

  if (top.length === 0) {
    container.innerHTML = '<div class="db-mini-empty">Sem gastos este mês</div>';
    return;
  }

  container.innerHTML = top.map(([cat, val]) => {
    const pct  = total > 0 ? (val / total * 100).toFixed(0) : 0;
    const cor  = getCategoriaColor(cat);
    return `
      <div>
        <div class="db-mini-row">
          <div class="db-mini-dot" style="background:${cor};"></div>
          <div class="db-mini-nome">${escapeHtml(cat)}</div>
          <div class="db-mini-val">${pct}%</div>
        </div>
        <div class="db-prog-bg">
          <div class="db-prog-fill" style="width:${pct}%; background:${cor};"></div>
        </div>
      </div>`;
  }).join('');
}

/** @private Cartões com limite utilizado */
function _renderMiniCartoes() {
  const container = document.getElementById('db-cartoes-lista');
  const empty     = document.getElementById('db-cartoes-empty');
  if (!container) return;

  if (cartoes.length === 0) {
    container.style.display = 'none';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';
  container.style.display = 'flex';

  container.innerHTML = cartoes.slice(0, 3).map(c => {
    const usado = getTotalUtilizadoCartao(c.id);
    const pct   = c.limite > 0 ? Math.min(usado / c.limite * 100, 100) : 0;
    const cor   = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#1D9E75';
    return `
      <div>
        <div class="db-mini-row">
          <div class="db-mini-dot" style="background:${cor};"></div>
          <div class="db-mini-nome">${escapeHtml(c.nome)}</div>
          <div class="db-mini-val">${formatMoney(usado)}</div>
        </div>
        <div class="db-prog-bg">
          <div class="db-prog-fill" style="width:${pct}%; background:${cor};"></div>
        </div>
        <div class="db-cartao-limite">${pct.toFixed(0)}% de ${formatMoney(c.limite)}</div>
      </div>`;
  }).join('');
}

/** @private Orçamentos do mês com progresso */
function _renderMiniOrcamentos() {
  const container = document.getElementById('db-orcamentos-lista');
  const empty     = document.getElementById('db-orcamentos-empty');
  if (!container) return;

  const orcsMes = orcamentos.filter(o => o.mes === dashMes && o.ano === dashAno);
  if (orcsMes.length === 0) {
    container.style.display = 'none';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';
  container.style.display = 'flex';

  const gastos = _calcularGastosPorCategoria(dashMes, dashAno);
  container.innerHTML = orcsMes.slice(0, 4).map(o => {
    const gasto = gastos[o.categoria] || 0;
    const pct   = o.limite > 0 ? Math.min(gasto / o.limite * 100, 100) : 0;
    const cor   = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#1D9E75';
    return `
      <div>
        <div class="db-mini-row">
          <div class="db-mini-dot" style="background:${cor};"></div>
          <div class="db-mini-nome">${escapeHtml(o.categoria)}</div>
          <div class="db-mini-val">${pct.toFixed(0)}%</div>
        </div>
        <div class="db-prog-bg">
          <div class="db-prog-fill" style="width:${pct}%; background:${cor};"></div>
        </div>
      </div>`;
  }).join('');
}

// ---------- Linha 4 — Insights automáticos ----------

/**
 * Gera insights automáticos com base nos dados do mês.
 * @private
 */
function _renderInsights() {
  const container = document.getElementById('db-insights-lista');
  if (!container) return;

  const hoje  = new Date();
  const mes   = hoje.getMonth();
  const ano   = hoje.getFullYear();
  const isMesAtual = (dashMes === mes && dashAno === ano);
  const insights = [];

  const recMes = lancamentos
    .filter(l => { const d = parseLocalDate(l.data); return l.valor > 0 && l.tipo !== 'pagamento_fatura' && d.getMonth() === dashMes && d.getFullYear() === dashAno; })
    .reduce((s, l) => s + l.valor, 0);
  const despMes = lancamentos
    .filter(l => { const d = parseLocalDate(l.data); return l.valor < 0 && l.tipo === 'despesa_avista' && d.getMonth() === dashMes && d.getFullYear() === dashAno; })
    .reduce((s, l) => s + Math.abs(l.valor), 0) + _somarParcelasDoMes(dashMes, dashAno);

  // 1. Taxa de poupança
  if (recMes > 0) {
    const taxa = ((recMes - despMes) / recMes * 100);
    if (taxa >= 20) {
      insights.push({ icon: '🏆', text: `Ótima taxa de poupança: <strong>${taxa.toFixed(1)}%</strong> da renda guardada este mês.` });
    } else if (taxa > 0) {
      insights.push({ icon: '💡', text: `Taxa de poupança de <strong>${taxa.toFixed(1)}%</strong>. Meta recomendada: pelo menos 20%.` });
    } else {
      insights.push({ icon: '⚠️', text: `Gastos <strong>${formatMoney(despMes - recMes)}</strong> acima da renda este mês.` });
    }
  }

  // 2. Categoria campeã de gastos
  const gastos = _calcularGastosPorCategoria(dashMes, dashAno);
  const [topCat, topVal] = Object.entries(gastos).sort((a, b) => b[1] - a[1])[0] || [];
  if (topCat && recMes > 0) {
    const pctCat = (topVal / recMes * 100).toFixed(1);
    insights.push({ icon: '📂', text: `<strong>${escapeHtml(topCat)}</strong> foi sua maior despesa: ${formatMoney(topVal)} (${pctCat}% da renda).` });
  }

  // 3. Tendência vs mês anterior
  const mesAnt = dashMes === 0 ? 11 : dashMes - 1;
  const anoAnt = dashMes === 0 ? dashAno - 1 : dashAno;
  const despAnt = lancamentos
    .filter(l => { const d = parseLocalDate(l.data); return l.valor < 0 && l.tipo === 'despesa_avista' && d.getMonth() === mesAnt && d.getFullYear() === anoAnt; })
    .reduce((s, l) => s + Math.abs(l.valor), 0) + _somarParcelasDoMes(mesAnt, anoAnt);
  if (despAnt > 0) {
    const delta = ((despMes - despAnt) / despAnt * 100);
    if (delta > 10) {
      insights.push({ icon: '📈', text: `Gastos <strong>${delta.toFixed(1)}% maiores</strong> que ${mesesNomes[mesAnt]}. Vale revisar.` });
    } else if (delta < -10) {
      insights.push({ icon: '📉', text: `Gastos <strong>${Math.abs(delta).toFixed(1)}% menores</strong> que ${mesesNomes[mesAnt]}. Bom controle!` });
    }
  }

  // 4. Orçamentos estourados
  if (isMesAtual) {
    const orcsMes = orcamentos.filter(o => o.mes === mes && o.ano === ano);
    for (const o of orcsMes) {
      const gasto = gastos[o.categoria] || 0;
      const pct   = gasto / o.limite * 100;
      if (pct >= 100) {
        insights.push({ icon: '🔴', text: `Orçamento de <strong>${escapeHtml(o.categoria)}</strong> estourado: ${formatMoney(gasto)} de ${formatMoney(o.limite)}.` });
      } else if (pct >= 80) {
        insights.push({ icon: '🟡', text: `Orçamento de <strong>${escapeHtml(o.categoria)}</strong> em ${pct.toFixed(0)}% — restam ${formatMoney(o.limite - gasto)}.` });
      }
    }

    // 5. Cartão com limite alto
    for (const c of cartoes) {
      const usado = getTotalUtilizadoCartao(c.id);
      const pct   = c.limite > 0 ? usado / c.limite * 100 : 0;
      if (pct > 80) {
        insights.push({ icon: '💳', text: `Cartão <strong>${escapeHtml(c.nome)}</strong> com ${pct.toFixed(0)}% do limite utilizado.` });
      }
    }

    // 6. Projeção fim de mês
    const diaAtual  = hoje.getDate();
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    if (diaAtual > 0 && recMes > 0) {
      const projecao = despMes + (despMes / diaAtual) * (diasNoMes - diaAtual);
      if (projecao > recMes) {
        insights.push({ icon: '🔮', text: `Projeção de gastos até fim do mês: <strong>${formatMoney(projecao)}</strong> — acima da renda.` });
      }
    }

    // 7. Saldo negativo
    if (calcularSaldoReal() < 0) {
      insights.push({ icon: '🔴', text: `Saldo atual negativo: <strong>${formatMoney(calcularSaldoReal())}</strong>.` });
    }
  }

  if (insights.length === 0) {
    container.innerHTML = '<div class="db-insight-empty">Tudo certo por aqui! Nenhum alerta para este mês. 🎉</div>';
    return;
  }

  container.innerHTML = insights.map(i => `
    <div class="db-insight-item">
      <span class="db-insight-icon">${i.icon}</span>
      <span class="db-insight-text">${i.text}</span>
    </div>`).join('');
}

// ---------- Ponto de entrada do dashboard ----------

/**
 * Atualiza todos os elementos visuais do dashboard (4 linhas).
 */
function atualizarDashboard() {
  _renderLinha1();        // saldo atual, previsto, economia
  atualizarGrafico();     // doughnut (usa dashMes/dashAno)
  renderEvolutionChart(); // barras + linha
  _atualizarChartMesLabel();
  _renderLinha3();        // categorias, cartões, orçamentos
  _renderInsights();      // linha 4
  renderHistorico();

  // IDs legados (mantidos para compatibilidade com outras telas)
  _atualizarHeroBalance();
  _atualizarAnalise();
  calcularMetricasAvancadas();
}

// ---------- Hero balance ----------

/**
 * Atualiza o card principal (hero) com saldo atual, receitas e despesas.
 * @private
 */
function _atualizarHeroBalance() {
  const saldo = calcularSaldoReal();
  const receitas = lancamentos.filter(l => l.valor > 0 && l.tipo !== 'pagamento_fatura').reduce((s, l) => s + l.valor, 0);
  const despesas = lancamentos.filter(l => l.valor < 0 && l.tipo === 'despesa_avista').reduce((s, l) => s + Math.abs(l.valor), 0);

  const elSaldo = document.getElementById('hero-balance');
  if (elSaldo) {
    elSaldo.textContent = formatMoney(saldo);
    elSaldo.classList.toggle('saldo-negativo', saldo < 0);
  }

  const receitasEl = document.getElementById('hero-receitas');
  if (receitasEl) receitasEl.textContent = formatMoney(receitas);
  
  const despesasEl = document.getElementById('hero-despesas');
  if (despesasEl) despesasEl.textContent = formatMoney(despesas);
}

// ---------- Análise do mês ----------

/**
 * Atualiza os indicadores de poupança, gastos essenciais e supérfluos do mês atual.
 * @private
 */
function _atualizarAnalise() {
  const hoje = new Date();
  const mes = hoje.getMonth();
  const ano = hoje.getFullYear();

  const receitasMes = lancamentos
    .filter(l => {
      const d = parseLocalDate(l.data);
      return l.valor > 0 && l.tipo !== 'pagamento_fatura' && d.getMonth() === mes && d.getFullYear() === ano;
    })
    .reduce((s, l) => s + l.valor, 0);

  const despesasMes = lancamentos
    .filter(l => {
      const d = parseLocalDate(l.data);
      return l.valor < 0 && l.tipo === 'despesa_avista' && d.getMonth() === mes && d.getFullYear() === ano;
    })
    .reduce((s, l) => s + Math.abs(l.valor), 0);

  const parcelasMes = _somarParcelasDoMes(mes, ano);
  const gastoTotal = despesasMes + parcelasMes;
  const poupanca = receitasMes > 0 ? ((receitasMes - gastoTotal) / receitasMes * 100) : (gastoTotal > 0 ? -100 : 0);

  const savingsEl = document.getElementById('savings');
  if (savingsEl) savingsEl.innerHTML = poupanca.toFixed(1) + '%';

  // Essenciais vs supérfluos
  let essencial = 0;
  let superfluo = 0;

  for (const l of lancamentos) {
    const d = parseLocalDate(l.data);
    if (l.valor < 0 && l.tipo === 'despesa_avista' && d.getMonth() === mes && d.getFullYear() === ano) {
      if (CATEGORIAS_ESSENCIAIS.includes(l.categoria)) essencial += Math.abs(l.valor);
      else superfluo += Math.abs(l.valor);
    }
  }

  for (const compra of compras) {
    const cartao = cartoes.find(c => c.id === compra.cartaoId);
    if (!cartao) continue;
    for (let i = 0; i < compra.parcelas; i++) {
      const venc = getDataVencimentoParcela(compra, cartao, i);
      if (venc.getMonth() === mes && venc.getFullYear() === ano && i >= compra.parcelasPagas) {
        if (CATEGORIAS_ESSENCIAIS.includes(compra.categoria)) essencial += compra.valorParcela;
        else superfluo += compra.valorParcela;
      }
    }
  }

  const totalGastos = essencial + superfluo;
  const essencialEl = document.getElementById('essencial');
  const superfluoEl = document.getElementById('superfluo');
  const gastosEssenciaisEl = document.getElementById('gastos-essenciais-mensais');
  
  if (essencialEl) essencialEl.innerHTML = totalGastos > 0 ? (essencial / totalGastos * 100).toFixed(1) + '%' : '0%';
  if (superfluoEl) superfluoEl.innerHTML = totalGastos > 0 ? (superfluo / totalGastos * 100).toFixed(1) + '%' : '0%';
  if (gastosEssenciaisEl) gastosEssenciaisEl.innerHTML = formatMoney(essencial);
}

/**
 * Atualiza o indicador de uso do limite dos cartões.
 * @private
 */
function _atualizarUsoCartoes() {
  let totalUsado = 0;
  let totalLimite = 0;
  for (const cartao of cartoes) {
    totalUsado += getTotalUtilizadoCartao(cartao.id);
    totalLimite += cartao.limite;
  }
  const usoCartaoEl = document.getElementById('uso-cartao');
  if (usoCartaoEl) usoCartaoEl.innerHTML = totalLimite > 0 ? (totalUsado / totalLimite * 100).toFixed(1) + '%' : '0%';
}

// ---------- Gráficos ----------

/**
 * Renderiza o gráfico de evolução patrimonial dos últimos 12 meses.
 * @global evolutionChart
 */
function renderEvolutionChart() {
  const labels    = [];
  const receitas  = [];
  const despesas  = [];
  const saldos    = [];

  for (let i = 11; i >= 0; i--) {
    const ref = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
    const mes = ref.getMonth();
    const ano = ref.getFullYear();

    const rec = lancamentos
      .filter(l => {
        const d = parseLocalDate(l.data);
        return l.valor > 0 && l.tipo !== 'pagamento_fatura' && d.getMonth() === mes && d.getFullYear() === ano;
      })
      .reduce((s, l) => s + l.valor, 0);

    const desp = lancamentos
      .filter(l => {
        const d = parseLocalDate(l.data);
        return l.valor < 0 && l.tipo === 'despesa_avista' && d.getMonth() === mes && d.getFullYear() === ano;
      })
      .reduce((s, l) => s + Math.abs(l.valor), 0);

    const parcelas = _somarParcelasDoMes(mes, ano);
    const pags = lancamentos
      .filter(l => {
        const d = parseLocalDate(l.data);
        return l.tipo === 'pagamento_fatura' && d.getMonth() === mes && d.getFullYear() === ano;
      })
      .reduce((s, l) => s + Math.abs(l.valor), 0);

    const despTotal = desp + parcelas + pags;

    labels.push(`${mesesNomes[mes].substring(0, 3)}/${String(ano).slice(2)}`);
    receitas.push(parseFloat(rec.toFixed(2)));
    despesas.push(parseFloat(despTotal.toFixed(2)));
    saldos.push(parseFloat((rec - despTotal).toFixed(2)));
  }

  const ctx = document.getElementById('evolution-chart');
  if (!ctx) return;

  // Remove estilo inline antigo — altura vem do CSS do .db-bars-wrap
  ctx.style.width  = '';
  ctx.style.height = '';

  // Cores semânticas fixas
  const COR_RECEITA  = '#1D9E75';  // teal
  const COR_DESPESA  = '#E24B4A';  // vermelho
  const COR_SALDO_POS = '#534AB7'; // roxo — saldo positivo
  const COR_SALDO_NEG = '#D85A30'; // coral — saldo negativo

  const pontosCorSaldo = saldos.map(v => v >= 0 ? COR_SALDO_POS : COR_SALDO_NEG);

  const datasets = [
    {
      type: 'bar',
      label: 'Receita',
      data: receitas,
      backgroundColor: `${COR_RECEITA}CC`,   // 80% opacidade
      hoverBackgroundColor: COR_RECEITA,
      borderRadius: 4,
      borderSkipped: false,
      yAxisID: 'y',
      order: 2,
    },
    {
      type: 'bar',
      label: 'Despesa',
      data: despesas,
      backgroundColor: `${COR_DESPESA}CC`,
      hoverBackgroundColor: COR_DESPESA,
      borderRadius: 4,
      borderSkipped: false,
      yAxisID: 'y',
      order: 2,
    },
    {
      type: 'line',
      label: 'Saldo',
      data: saldos,
      borderColor: pontosCorSaldo,            // segmento a segmento
      backgroundColor: 'transparent',
      borderWidth: 2,
      tension: 0.35,
      pointBackgroundColor: pontosCorSaldo,
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
      yAxisID: 'y',
      order: 1,                               // renderiza na frente das barras
      segment: {
        // Linha muda de cor quando cruza zero
        borderColor: ctx => saldos[ctx.p1DataIndex] >= 0 ? COR_SALDO_POS : COR_SALDO_NEG,
      },
    },
  ];

  const tooltipCallbacks = {
    title: ctx => ctx[0].label,
    label: ctx => {
      const prefixo = ctx.dataset.label;
      const val = formatMoney(Math.abs(ctx.raw));
      const sinal = ctx.dataset.label === 'Saldo' && ctx.raw < 0 ? '▼ ' : '';
      return `  ${prefixo}: ${sinal}${val}`;
    },
    afterBody: ctx => {
      const idx = ctx[0].dataIndex;
      const economia = receitas[idx] > 0
        ? `  Taxa de poupança: ${((saldos[idx] / receitas[idx]) * 100).toFixed(1)}%`
        : '';
      return economia ? [economia] : [];
    },
  };

  const scalesConfig = {
    x: {
      grid: { display: false },
      ticks: { font: { size: 10 }, maxRotation: 0 },
    },
    y: {
      grid: { color: 'rgba(0,0,0,0.05)' },
      ticks: {
        callback: v => {
          if (Math.abs(v) >= 1000) return `R$${(v / 1000).toFixed(0)}k`;
          return `R$${v}`;
        },
        font: { size: 10 },
        maxTicksLimit: 6,
      },
    },
  };

  // ✅ Reutiliza instância existente
  if (evolutionChart) {
    evolutionChart.data.labels   = labels;
    evolutionChart.data.datasets = datasets;
    evolutionChart.options.plugins.tooltip.callbacks = tooltipCallbacks;
    evolutionChart.update('none');
    return;
  }

  evolutionChart = new Chart(ctx.getContext('2d'), {
    type: 'bar',                              // tipo base; datasets sobrescrevem individualmente
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false }, // tooltip agrupa os 3 datasets
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            font: { size: 11 },
            padding: 12,
            usePointStyle: true,
            pointStyleWidth: 8,
            color: getComputedStyle(document.body).getPropertyValue('--color-text') || '#374151',
          },
        },
        tooltip: {
          backgroundColor: 'rgba(15,23,42,0.9)',
          titleFont: { size: 12, weight: '500' },
          bodyFont:  { size: 12 },
          padding: 10,
          cornerRadius: 8,
          callbacks: tooltipCallbacks,
        },
      },
      scales: scalesConfig,
      animation: { duration: 500, easing: 'easeOutQuart' },
    },
  });
}

/**
 * Renderiza o gráfico de rosca (distribuição por categoria).
 * Usa a variável global `chartType` para alternar entre receitas e despesas.
 * @global chart
 */
function atualizarGrafico() {
  const mes = dashMes;
  const ano = dashAno;
  let itens = [];

  if (chartType === 'receita') {
    itens = lancamentos.filter(l => {
      const d = parseLocalDate(l.data);
      return l.valor > 0 && l.tipo !== 'pagamento_fatura' && d.getMonth() === mes && d.getFullYear() === ano;
    });
  } else {
    const despesas = lancamentos.filter(l => {
      const d = parseLocalDate(l.data);
      return l.valor < 0 && l.tipo === 'despesa_avista' && d.getMonth() === mes && d.getFullYear() === ano;
    });
    const parcelas = [];
    for (const compra of compras) {
      const cartao = cartoes.find(c => c.id === compra.cartaoId);
      if (!cartao) continue;
      for (let i = 0; i < compra.parcelas; i++) {
        const venc = getDataVencimentoParcela(compra, cartao, i);
        if (venc.getMonth() === mes && venc.getFullYear() === ano && i >= compra.parcelasPagas) {
          parcelas.push({ categoria: compra.categoria, valor: compra.valorParcela });
        }
      }
    }
    itens = [...despesas, ...parcelas];
  }

  const canvas   = document.getElementById('chart');
  const emptyDiv = document.getElementById('chart-empty');
  const centerDiv = document.getElementById('chart-center-text');
  if (!canvas) return;

  if (itens.length === 0) {
    canvas.style.display = 'none';
    if (emptyDiv)  emptyDiv.style.display  = 'block';
    if (centerDiv) { centerDiv.classList.add('hidden'); centerDiv.style.display = ''; }
    if (chart) { chart.destroy(); chart = null; }
    return;
  }

  canvas.style.display = 'block';
  if (emptyDiv) emptyDiv.style.display = 'none';

  // Agrupa por categoria e calcula total
  const grupos = {};
  let total = 0;
  for (const item of itens) {
    const val = Math.abs(item.valor);
    grupos[item.categoria] = (grupos[item.categoria] || 0) + val;
    total += val;
  }

  // Ordena do maior para o menor (leitura mais natural no doughnut)
  const categorias = Object.keys(grupos).sort((a, b) => grupos[b] - grupos[a]);
  const valores    = categorias.map(c => grupos[c]);
  const cores      = categorias.map(c => getCategoriaColor(c));
  const coresFade  = categorias.map(c => getCategoriaColorAlpha(c, 0.7));

  // Legenda HTML externa (fora do canvas — garante centro geométrico exato)
  const legendaEl = document.getElementById('donut-legenda');
  if (legendaEl) {
    legendaEl.innerHTML = categorias.map((cat, i) => `
      <div class="donut-leg-item" onclick="_toggleDonutSlice(${i})">
        <span class="donut-leg-dot" style="background:${cores[i]};"></span>
        <span class="donut-leg-nome">${escapeHtml(cat)}</span>
        <span class="donut-leg-pct">${((valores[i]/total)*100).toFixed(1)}%</span>
      </div>`).join('');
  }

  // Configuração de tooltip (legenda removida do canvas)
  const pluginsConfig = {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(15,23,42,0.9)',
      titleFont: { size: 12, weight: '500' },
      bodyFont:  { size: 13 },
      padding: 10,
      cornerRadius: 8,
      callbacks: {
        title: ctx => ctx[0].label,
        label: ctx => {
          const pct = ((ctx.raw / total) * 100).toFixed(1);
          return `  ${formatMoney(ctx.raw)}  (${pct}%)`;
        },
      },
    },
  };

  // ✅ Reutiliza instância com update() — sem destroy/create
  if (chart && chart.config.type === 'doughnut') {
    chart.data.labels                        = categorias;
    chart.data.datasets[0].data             = valores;
    chart.data.datasets[0].backgroundColor  = coresFade;
    chart.data.datasets[0].hoverBackgroundColor = cores;
    chart.options.plugins.legend            = pluginsConfig.legend;
    chart.options.plugins.tooltip           = pluginsConfig.tooltip;
    chart.update('active');
  } else {
    if (chart) chart.destroy();
    chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: categorias,
        datasets: [{
          data: valores,
          backgroundColor:      coresFade,
          hoverBackgroundColor: cores,
          borderWidth: 2,
          borderColor: 'transparent',
          hoverBorderColor: '#fff',
          hoverOffset: 6,
          cutout: '72%',
        }],
      },
      options: {
        responsive: false,
        animation: { duration: 400, easing: 'easeOutQuart' },
        plugins: pluginsConfig,
      },
    });
  }

  // Texto central com total
  if (centerDiv) {
    centerDiv.classList.remove('hidden');
    centerDiv.innerHTML = `
      <span class="chart-center-value">${formatMoney(total)}</span>
      <span class="chart-center-label">${chartType === 'receita' ? 'Receitas' : 'Despesas'}</span>
      <span class="chart-center-label">${mesesNomes[mes].substring(0,3)} ${ano}</span>`;
  }
}

/**
 * Oculta/exibe uma fatia do doughnut ao clicar na legenda HTML.
 * @param {number} index
 */
function _toggleDonutSlice(index) {
  if (!chart) return;
  const meta = chart.getDatasetMeta(0);
  const item = meta.data[index];
  item.hidden = !item.hidden;
  const itens = document.querySelectorAll('.donut-leg-item');
  if (itens[index]) itens[index].style.opacity = item.hidden ? '0.4' : '1';
  chart.update();
}

/**
 * Alterna o gráfico entre despesas e receitas.
 * @param {'despesa'|'receita'} tipo - O novo tipo para o gráfico.
 */
function toggleChart(tipo) {
  chartType = tipo;
  document.getElementById('btn-despesas')?.classList.toggle('active', tipo === 'despesa');
  document.getElementById('btn-receitas')?.classList.toggle('active', tipo === 'receita');
  atualizarGrafico();
}

// ---------- Métricas avançadas ----------

/**
 * Calcula e exibe métricas avançadas: média de gastos/dia,
 * categoria que mais gasta, dias sem gastos e projeção para o fim do mês.
 */
function calcularMetricasAvancadas() {
  const hoje = new Date();
  const mes = hoje.getMonth();
  const ano = hoje.getFullYear();
  const diaAtual = hoje.getDate();

  const despesasMes = lancamentos
    .filter(l => {
      const d = parseLocalDate(l.data);
      return l.valor < 0 && l.tipo === 'despesa_avista' && d.getMonth() === mes && d.getFullYear() === ano;
    })
    .reduce((s, l) => s + Math.abs(l.valor), 0);

  const parcelasMes = _somarParcelasDoMes(mes, ano);
  const gastosTotais = despesasMes + parcelasMes;

  const mediaGastosEl = document.getElementById('media-gastos-diarios');
  if (mediaGastosEl) mediaGastosEl.innerHTML = formatMoney(gastosTotais / diaAtual);

  // Tendência vs mês anterior
  const mesAnt = mes === 0 ? 11 : mes - 1;
  const anoAnt = mes === 0 ? ano - 1 : ano;
  const despesasAnt = lancamentos
    .filter(l => {
      const d = parseLocalDate(l.data);
      return l.valor < 0 && l.tipo === 'despesa_avista' && d.getMonth() === mesAnt && d.getFullYear() === anoAnt;
    })
    .reduce((s, l) => s + Math.abs(l.valor), 0);
  const gastosAnt = despesasAnt + _somarParcelasDoMes(mesAnt, anoAnt);

  const trend = document.getElementById('trend-gastos');
  if (trend) {
    if (gastosAnt > 0) {
      const diff = (gastosTotais - gastosAnt) / gastosAnt * 100;
      if (diff > 0) {
        trend.innerHTML = `📈 +${diff.toFixed(1)}%`;
        trend.className = 'metric-trend up';
      } else if (diff < 0) {
        trend.innerHTML = `📉 ${diff.toFixed(1)}%`;
        trend.className = 'metric-trend down';
      } else {
        trend.innerHTML = '➡️ igual';
      }
    } else {
      trend.innerHTML = 'vs mês anterior';
    }
  }

  // Categoria que mais gastou
  const gastosCat = _calcularGastosPorCategoria(mes, ano);
  let maiorCat = '';
  let maiorVal = 0;
  for (const [cat, val] of Object.entries(gastosCat)) {
    if (val > maiorVal) {
      maiorVal = val;
      maiorCat = cat;
    }
  }
  const maiorCategoriaEl = document.getElementById('maior-categoria');
  if (maiorCategoriaEl) maiorCategoriaEl.innerHTML = maiorCat ? `${maiorCat} (${formatMoney(maiorVal)})` : '—';

  // Dias sem gastos
  const diasComGasto = new Set(
    lancamentos
      .filter(l => {
        const d = parseLocalDate(l.data);
        return l.valor < 0 && l.tipo === 'despesa_avista' && d.getMonth() === mes && d.getFullYear() === ano;
      })
      .map(l => parseLocalDate(l.data).getDate())
  );
  const diasZeradosEl = document.getElementById('dias-zerados');
  if (diasZeradosEl) diasZeradosEl.innerHTML = diaAtual - diasComGasto.size;

  // Projeção fim do mês
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const projecao = gastosTotais + (gastosTotais / diaAtual) * (diasNoMes - diaAtual);
  const projecaoEl = document.getElementById('projecao-mes');
  if (projecaoEl) projecaoEl.innerHTML = formatMoney(projecao);
}

// ---------- Alertas inteligentes ----------

/**
 * Renderiza alertas automáticos: saldo negativo, limite de cartão alto,
 * orçamentos próximos ou estourados.
 */
function renderSmartAlerts() {
  const container = document.getElementById('smart-alerts');
  if (!container) return;
  container.innerHTML = '';

  // Saldo negativo
  const saldo = calcularSaldoReal();
  if (saldo < 0) {
    container.innerHTML += `<div class="smart-alert" style="border-left-color:var(--danger);">
      <strong>🔴 Saldo Negativo:</strong> ${formatMoney(saldo)}
    </div>`;
  }

  // Cartões com uso alto
  for (const cartao of cartoes) {
    const usado = getTotalUtilizadoCartao(cartao.id);
    const pct = cartao.limite > 0 ? (usado / cartao.limite * 100) : 0;
    if (pct > 70) {
      container.innerHTML += `<div class="smart-alert">
        💳 ${pct.toFixed(0)}% do limite do ${escapeHtml(cartao.nome)}
      </div>`;
    }
  }

  // Orçamentos próximos do limite
  const hoje = new Date();
  const mes = hoje.getMonth();
  const ano = hoje.getFullYear();
  const gastosReais = _calcularGastosPorCategoria(mes, ano);

  for (const o of orcamentos.filter(o => o.mes === mes && o.ano === ano)) {
    const gasto = gastosReais[o.categoria] || 0;
    const pct = (gasto / o.limite) * 100;

    if (pct >= 90) {
      container.innerHTML += `<div class="smart-alert" style="border-left-color:var(--danger);">
        ⚠️ Orçamento de ${escapeHtml(o.categoria)}: ${pct.toFixed(0)}%
        (${formatMoney(gasto)} de ${formatMoney(o.limite)})
      </div>`;
    } else if (pct >= 70) {
      container.innerHTML += `<div class="smart-alert">
        📊 Orçamento de ${escapeHtml(o.categoria)}: ${pct.toFixed(0)}% consumido
      </div>`;
    }
  }
}

// ---------- Histórico / Extrato ----------

/**
 * Renderiza os últimos 10 lançamentos no dashboard, com filtros de tipo e categoria.
 */
function renderHistorico() {
  const tipoFiltro = document.getElementById('filter-type')?.value || 'all';
  const catFiltro = document.getElementById('filter-cat')?.value || 'all';

  let itens = obterTodosLancamentosParaUI();

  if (tipoFiltro === 'receita') itens = itens.filter(i => i.valor > 0 && i.tipo !== 'pagamento_fatura');
  else if (tipoFiltro === 'despesa') itens = itens.filter(i => i.valor < 0);
  if (catFiltro !== 'all') itens = itens.filter(i => i.categoria === catFiltro);

  // 🔥 CORREÇÃO: Ordena usando parseLocalDate
  itens.sort((a, b) => {
    const da = parseLocalDate(a.data);
    const db = parseLocalDate(b.data);
    return db - da;
  });

  const container = document.getElementById('history-list');
  if (!container) return;

  if (itens.length === 0) {
    container.innerHTML = '<div class="empty-state-modern"><div class="icon">📭</div><div class="title">Nenhuma transação encontrada</div></div>';
    return;
  }

  container.innerHTML = '<div class="transacoes-container"></div>';
  const cd = container.querySelector('.transacoes-container');
  let ultimaData = '';

  for (const t of itens.slice(0, 10)) {
    const dataObj = parseLocalDate(t.data);
    const dataLabel = dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    if (dataLabel !== ultimaData && cd) {
      cd.innerHTML += `<div class="grupo-dia">📅 ${dataLabel}</div>`;
      ultimaData = dataLabel;
    }
    if (cd) cd.innerHTML += _renderCardTransacao(t);
  }
}


/**
 * Renderiza as transações de um determinado mês/ano no extrato completo.
 * @param {number} mes - Mês (0-indexado).
 * @param {number} ano - Ano.
 */
function carregarExtratoComFiltro(mes, ano) {
  const todos = obterTodosLancamentosParaUI();
  const filtrados = todos
    .filter(t => {
      const d = parseLocalDate(t.data); // 🔥 USAR parseLocalDate
      return d.getMonth() === mes && d.getFullYear() === ano;
    })
    .sort((a, b) => {
      const da = parseLocalDate(a.data);
      const db = parseLocalDate(b.data);
      return db - da; // ordena do mais recente para o mais antigo
    });

  _renderResumoExtrato(filtrados, mes, ano);
  _renderListaExtrato(filtrados);
}

/**
 * Gera o resumo financeiro do extrato (bloco com 6 cards).
 * @param {Array} filtrados - Lista de lançamentos filtrados.
 * @param {number} mes - Mês.
 * @param {number} ano - Ano.
 * @private
 */
function _renderResumoExtrato(filtrados, mes, ano) {
  const receitas = filtrados.filter(t => t.valor > 0 && t.tipo !== 'pagamento_fatura').reduce((s, t) => s + t.valor, 0);
  const despesasAvista = filtrados.filter(t => t.valor < 0 && t.tipo !== 'compra_parcelada').reduce((s, t) => s + Math.abs(t.valor), 0);
  const comprasCartao = filtrados.filter(t => t.tipo === 'compra_parcelada').reduce((s, t) => s + Math.abs(t.valor), 0);
  const pagamentos = filtrados.filter(t => t.tipo === 'pagamento_fatura').reduce((s, t) => s + Math.abs(t.valor), 0);
  const gastoTotal = despesasAvista + comprasCartao;
  const saldoConta = receitas - despesasAvista - pagamentos;
  const economia = receitas - gastoTotal;

  const extratoResumo = document.getElementById('extrato-resumo');
  if (!extratoResumo) return;

  extratoResumo.innerHTML = `
    <div class="extrato-resumo">
      <div class="resumo-card receita"><div class="emoji">💰</div><div class="label">RECEITAS</div><div class="value">${formatMoney(receitas)}</div></div>
      <div class="resumo-card despesa"><div class="emoji">💸</div><div class="label">À VISTA</div><div class="value">${formatMoney(despesasAvista)}</div></div>
      <div class="resumo-card cartao"><div class="emoji">💳</div><div class="label">CARTÕES</div><div class="value">${formatMoney(comprasCartao)}</div></div>
      <div class="resumo-card"><div class="emoji">📉</div><div class="label">GASTO TOTAL</div><div class="value">${formatMoney(gastoTotal)}</div></div>
      <div class="resumo-card"><div class="emoji">🏦</div><div class="label">SALDO CONTA</div><div class="value" style="color:${saldoConta < 0 ? 'var(--danger)' : 'var(--primary)'}">${formatMoney(saldoConta)}</div></div>
      <div class="resumo-card"><div class="emoji">📈</div><div class="label">ECONOMIA</div><div class="value" style="color:${economia >= 0 ? 'var(--success)' : 'var(--danger)'}">
        ${economia >= 0 ? formatMoney(economia) : '▼ ' + formatMoney(Math.abs(economia))}
      </div></div>
    </div>`;
}

/**
 * Renderiza a lista de lançamentos do extrato.
 * @param {Array} filtrados - Lista de lançamentos filtrados.
 * @private
 */
function _renderListaExtrato(filtrados) {
  const container = document.getElementById('extrato-list');
  if (!container) return;

  if (filtrados.length === 0) {
    container.innerHTML = '<div class="empty-state-modern">📭 Nenhuma movimentação</div>';
    return;
  }

  container.innerHTML = '<div class="transacoes-container"></div>';
  const cd = container.querySelector('.transacoes-container');
  let ultimaData = '';

  for (const t of filtrados) {
    const dataLabel = new Date(t.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    if (dataLabel !== ultimaData && cd) {
      cd.innerHTML += `<div class="grupo-dia">📅 ${dataLabel}</div>`;
      ultimaData = dataLabel;
    }
    if (cd) cd.innerHTML += _renderCardTransacao(t, true);
  }
}

/**
 * Gera o HTML de um card de transação para o histórico ou extrato.
 * @param {Object} t - Objeto da transação.
 * @param {boolean} [comBotaoExcluirCompra=false] - Se deve incluir botão de excluir compra.
 * @returns {string} HTML do card.
 * @private
 */
 
 function _renderCardTransacao(t, comBotaoExcluirCompra = false) {
  let classe = '', icone = '', tipoLabel = '', badges = '', botoes = '';
  
  // 🔥 CORREÇÃO: Formata a data usando parseLocalDate
  const dataObj = parseLocalDate(t.data);
  const dataFormatada = dataObj.toLocaleDateString('pt-BR', { 
    day: '2-digit', 
    month: 'short',
    timeZone: 'America/Sao_Paulo'
  });

  if (t.tipo === 'pagamento_fatura') {
    classe = 'pagamento';
    icone = '🏦';
    tipoLabel = 'Pagamento';
    badges = `<span class="transacao-categoria">${escapeHtml(t.categoria)}</span>`;
  } else if (t.valor > 0) {
    classe = 'receita';
    icone = '💰';
    tipoLabel = 'Receita';
    badges = `<span class="transacao-categoria">${escapeHtml(t.categoria)}</span>`;
    botoes = `<div class="transacao-actions">
      <button class="btn-edit" onclick="editarTransacao('${t.id}')" title="Editar">✏️</button>
      <button class="btn-delete" onclick="excluirItem('${t.id}')" title="Excluir">🗑️</button>
    </div>`;
  } else if (t.tipo === 'compra_parcelada') {
    const cartaoNome = cartoes.find(c => c.id === t.cartaoId)?.nome || 'Cartão';
    classe = 'cartao';
    icone = '💳';
    tipoLabel = `Compra ${t.parcelas}x`;
    badges = `
      <span class="transacao-categoria">${escapeHtml(t.categoria)}</span>
      <span class="parcela-badge">💰 ${formatMoney(t.valorParcela)}/mês</span>
      <span class="status-badge ${t.parcelasPagas === t.parcelas ? 'pago' : 'pendente'}">
        💳 ${escapeHtml(cartaoNome)} • ${t.parcelasPagas}/${t.parcelas}
      </span>`;
    botoes = `<div class="transacao-actions">
      <button class="btn-delete" onclick="excluirCompra('${t.compraId}')" title="Excluir compra">🗑️</button>
    </div>`;
  } else {
    classe = 'despesa';
    icone = '💸';
    tipoLabel = 'Despesa';
    badges = `<span class="transacao-categoria">${escapeHtml(t.categoria)}</span>`;
    botoes = `<div class="transacao-actions">
      <button class="btn-edit" onclick="editarTransacao('${t.id}')" title="Editar">✏️</button>
      <button class="btn-delete" onclick="excluirItem('${t.id}')" title="Excluir">🗑️</button>
    </div>`;
  }

  return `
    <div class="transacao-card ${classe}">
      <div class="transacao-main">
        <div class="transacao-info-area">
          <div class="transacao-header-row">
            <span class="transacao-icone">${icone}</span>
            <span class="transacao-tipo">${tipoLabel}</span>
            <span class="transacao-data">• ${dataFormatada}</span>
          </div>
          <div class="transacao-descricao">${escapeHtml(t.descricao)}</div>
          <div class="transacao-badges">${badges}</div>
        </div>
        <div class="transacao-right-area">
          <div class="transacao-valor">${formatMoney(t.valor)}</div>
          ${botoes}
        </div>
      </div>
    </div>`;
}
 
// ---------- Navegação do extrato ----------

/**
 * Atualiza o display do mês selecionado no extrato.
 * @param {number} mes - Mês (0-indexado).
 * @param {number} ano - Ano.
 */
function atualizarDisplayMes(mes, ano) {
  const display = document.getElementById('current-month-display');
  if (display) display.innerHTML = `${mesesNomes[mes]} ${ano}`;
}

/**
 * Navega para o mês anterior ou próximo no extrato.
 * @param {-1|1} direcao - Direção da navegação.
 */
function navegarMes(direcao) {
  let mes = currentFilterMes + direcao;
  let ano = currentFilterAno;
  if (mes < 0) { mes = 11; ano--; }
  if (mes > 11) { mes = 0; ano++; }
  currentFilterMes = mes;
  currentFilterAno = ano;
  atualizarDisplayMes(mes, ano);
  carregarExtratoComFiltro(mes, ano);
}

/**
 * Volta o extrato para o mês atual.
 */
function setMesAtual() {
  const hoje = new Date();
  currentFilterMes = hoje.getMonth();
  currentFilterAno = hoje.getFullYear();
  atualizarDisplayMes(currentFilterMes, currentFilterAno);
  carregarExtratoComFiltro(currentFilterMes, currentFilterAno);
}

// ---------- Helpers privados ----------

/**
 * Soma todas as parcelas de compras no cartão que vencem em um determinado mês/ano.
 * @param {number} mes - Mês (0-indexado).
 * @param {number} ano - Ano.
 * @returns {number} Soma total das parcelas.
 * @private
 */
function _somarParcelasDoMes(mes, ano) {
  let total = 0;
  for (const compra of compras) {
    const cartao = cartoes.find(c => c.id === compra.cartaoId);
    if (!cartao) continue;
    for (let i = 0; i < compra.parcelas; i++) {
      const venc = getDataVencimentoParcela(compra, cartao, i);
      if (venc.getMonth() === mes && venc.getFullYear() === ano && i >= compra.parcelasPagas) {
        total += compra.valorParcela;
      }
    }
  }
  return total;
}

/**
 * Calcula o total gasto por categoria em um determinado mês/ano
 * (inclui despesas à vista + parcelas do cartão).
 * @param {number} mes - Mês (0-indexado).
 * @param {number} ano - Ano.
 * @returns {Object.<string, number>} Objeto com totais por categoria.
 * @private
 */
function _calcularGastosPorCategoria(mes, ano) {
  const gastos = {};

  for (const l of lancamentos) {
    const d = parseLocalDate(l.data);
    if (l.valor < 0 && l.tipo === 'despesa_avista' && d.getMonth() === mes && d.getFullYear() === ano) {
      gastos[l.categoria] = (gastos[l.categoria] || 0) + Math.abs(l.valor);
    }
  }

  for (const compra of compras) {
    const cartao = cartoes.find(c => c.id === compra.cartaoId);
    if (!cartao) continue;
    for (let i = 0; i < compra.parcelas; i++) {
      const venc = getDataVencimentoParcela(compra, cartao, i);
      if (venc.getMonth() === mes && venc.getFullYear() === ano && i >= compra.parcelasPagas) {
        gastos[compra.categoria] = (gastos[compra.categoria] || 0) + compra.valorParcela;
      }
    }
  }

  return gastos;
}