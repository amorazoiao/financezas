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
 * Paleta de cores para o gráfico de distribuição (doughnut).
 * @constant {string[]}
 */
const CHART_COLORS = [
  '#FF4757', '#1E90FF', '#FFA502', '#2ED573', '#A55EEA',
  '#70A1FF', '#FF6B81', '#FF9800', '#00CED1', '#FF69B4',
];

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

// ---------- Ponto de entrada do dashboard ----------

/**
 * Atualiza todos os elementos visuais do dashboard:
 * saldo hero, análise do mês, gráficos, métricas e histórico.
 */
function atualizarDashboard() {
  _atualizarHeroBalance();
  _atualizarAnalise();
  _atualizarUsoCartoes();
  atualizarGrafico();
  renderEvolutionChart();
  calcularMetricasAvancadas();
  renderHistorico();
  atualizarReservaDisplay();
  renderSmartAlerts();
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
 * Reutiliza a instância existente com chart.update() para evitar reflow.
 * @global evolutionChart
 */
function renderEvolutionChart() {
  const dados = [];

  for (let i = 11; i >= 0; i--) {
    const ref = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
    const mes = ref.getMonth();
    const ano = ref.getFullYear();

    const receitas = lancamentos
      .filter(l => {
        const d = parseLocalDate(l.data);
        return l.valor > 0 && l.tipo !== 'pagamento_fatura' && d.getMonth() === mes && d.getFullYear() === ano;
      })
      .reduce((s, l) => s + l.valor, 0);

    const despesas = lancamentos
      .filter(l => {
        const d = parseLocalDate(l.data);
        return l.valor < 0 && l.tipo === 'despesa_avista' && d.getMonth() === mes && d.getFullYear() === ano;
      })
      .reduce((s, l) => s + Math.abs(l.valor), 0);

    const parcelas = _somarParcelasDoMes(mes, ano);
    const pagamentos = lancamentos
      .filter(l => {
        const d = parseLocalDate(l.data);
        return l.tipo === 'pagamento_fatura' && d.getMonth() === mes && d.getFullYear() === ano;
      })
      .reduce((s, l) => s + Math.abs(l.valor), 0);

    dados.push({
      mes: `${mesesNomes[mes].substring(0, 3)}/${ano}`,
      saldo: receitas - despesas - pagamentos - parcelas,
    });
  }

  const ctx = document.getElementById('evolution-chart');
  if (!ctx) return;

  const labels  = dados.map(d => d.mes);
  const valores = dados.map(d => d.saldo);
  const pontos  = valores.map(v => v >= 0 ? '#22c55e' : '#ef4444');

  // ✅ Reutiliza a instância existente em vez de destruir e recriar
  if (evolutionChart) {
    evolutionChart.data.labels = labels;
    evolutionChart.data.datasets[0].data   = valores;
    evolutionChart.data.datasets[0].pointBackgroundColor = pontos;
    evolutionChart.update('none'); // 'none' = sem animação, mais rápido
    return;
  }

  evolutionChart = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Saldo',
        data: valores,
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79,70,229,0.1)',
        fill: true,
        tension: 0.3,
        pointBackgroundColor: pontos,
        pointBorderColor: '#fff',
        pointRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `Saldo: ${formatMoney(ctx.raw)}` } },
      },
      scales: { y: { ticks: { callback: v => formatMoney(v) } } },
    },
  });
}

/**
 * Renderiza o gráfico de rosca (distribuição por categoria).
 * Usa a variável global `chartType` para alternar entre receitas e despesas.
 * @global chart
 */
function atualizarGrafico() {
  const hoje = new Date();
  const mes = hoje.getMonth();
  const ano = hoje.getFullYear();
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

  const canvas = document.getElementById('chart');
  const emptyDiv = document.getElementById('chart-empty');

  if (!canvas) return;

  if (itens.length === 0) {
    canvas.style.display = 'none';
    if (emptyDiv) emptyDiv.style.display = 'block';
    return;
  }

  canvas.style.display = 'block';
  if (emptyDiv) emptyDiv.style.display = 'none';

  // Agrupa por categoria
  const grupos = {};
  let total = 0;
  for (const item of itens) {
    const val = Math.abs(item.valor);
    grupos[item.categoria] = (grupos[item.categoria] || 0) + val;
    total += val;
  }

  if (chart) chart.destroy();

  chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: Object.keys(grupos),
      datasets: [{
        data: Object.values(grupos),
        backgroundColor: CHART_COLORS,
        borderWidth: 0,
        cutout: '70%',
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.label}: ${formatMoney(ctx.raw)} (${((ctx.raw / total) * 100).toFixed(1)}%)`,
          },
        },
      },
    },
  });

  const centerDiv = document.getElementById('chart-center-text');
  if (centerDiv) {
    centerDiv.style.display = 'block';
    centerDiv.innerHTML = `
      <span class="chart-center-value">${formatMoney(total)}</span>
      <span style="font-size:var(--font-sm);">${chartType === 'receita' ? 'Receitas' : 'Despesas'}</span>`;
  }
}

/**
 * Alterna o gráfico entre despesas e receitas.
 * @param {'despesa'|'receita'} tipo - O novo tipo para o gráfico.
 */
function toggleChart(tipo) {
  chartType = tipo;
  const btnDespesas = document.getElementById('btn-despesas');
  const btnReceitas = document.getElementById('btn-receitas');
  if (btnDespesas) btnDespesas.classList.toggle('active', tipo === 'despesa');
  if (btnReceitas) btnReceitas.classList.toggle('active', tipo === 'receita');
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

  // ✅ Usa insertAdjacentHTML para evitar múltiplos reflows no loop
  container.innerHTML = '<div class="transacoes-container"></div>';
  const cd = container.querySelector('.transacoes-container');
  let ultimaData = '';

  for (const t of itens.slice(0, 10)) {
    const dataObj = parseLocalDate(t.data);
    const dataLabel = dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    if (dataLabel !== ultimaData && cd) {
      cd.insertAdjacentHTML('beforeend', `<div class="grupo-dia">📅 ${dataLabel}</div>`);
      ultimaData = dataLabel;
    }
    if (cd) cd.insertAdjacentHTML('beforeend', _renderCardTransacao(t));
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

  // ✅ insertAdjacentHTML evita reflows múltiplos em loops longos
  container.innerHTML = '<div class="transacoes-container"></div>';
  const cd = container.querySelector('.transacoes-container');
  let ultimaData = '';

  for (const t of filtrados) {
    // ✅ parseLocalDate evita o deslocamento de fuso UTC ao usar YYYY-MM-DD
    const dataLabel = parseLocalDate(t.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    if (dataLabel !== ultimaData && cd) {
      cd.insertAdjacentHTML('beforeend', `<div class="grupo-dia">📅 ${dataLabel}</div>`);
      ultimaData = dataLabel;
    }
    if (cd) cd.insertAdjacentHTML('beforeend', _renderCardTransacao(t, true));
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