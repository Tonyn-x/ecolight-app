/*
 * EcoLight - lógica principal da aplicação.
 *
 * O app funciona sem servidor: as contas ficam salvas apenas no navegador
 * por meio do Local Storage. Cada função tem uma responsabilidade pequena
 * para facilitar a manutenção e a documentação do projeto.
 */

(() => {
  'use strict';

  const STORAGE_KEY = 'ecolight-bills-v1';
  const sections = ['dashboard', 'register', 'calculator', 'tips'];
  // Sem backend nesta primeira versão, a bandeira é uma configuração explícita
  // e fácil de substituir quando a fonte oficial estiver disponível.
  const currentTariff = {
    name: 'Verde',
    description: 'Sem cobrança extra na tarifa.'
  };
  let bills = [];
  let consumptionChart = null; // referência à instância atual do Chart.js, para destruir antes de recriar

  const elements = {
    sections: Object.fromEntries(sections.map((section) => [section, document.getElementById(section)])),
    navigationButtons: document.querySelectorAll('[data-section]'),
    shortcutButtons: document.querySelectorAll('[data-go-to]'),
    billForm: document.getElementById('bill-form'),
    billId: document.getElementById('bill-id'),
    billMonth: document.getElementById('bill-month'),
    billConsumption: document.getElementById('bill-consumption'),
    billAmount: document.getElementById('bill-amount'),
    cancelEdit: document.getElementById('cancel-edit'),
    formMessage: document.getElementById('form-message'),
    historyList: document.getElementById('history-list'),
    emptyHistory: document.getElementById('empty-history'),
    historyCount: document.getElementById('history-count'),
    chartContainer: document.getElementById('chart-container'),
    chartCanvas: document.getElementById('graficoConsumo'),
    carouselTrack: document.getElementById('tips-carousel'),
    tariffName: document.getElementById('tariff-name'),
    tariffDescription: document.getElementById('tariff-description'),
    lastExpense: document.getElementById('last-expense'),
    lastExpenseMonth: document.getElementById('last-expense-month'),
    calculatorForm: document.getElementById('calculator-form'),
    calculatorResult: document.getElementById('calculator-result'),
    liveRegion: document.getElementById('live-region')
  };

  const numberFormatter = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const currencyFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  /** Inicializa a aplicação e conecta os eventos da interface. */
  function init() {
    bills = loadBills();
    bindNavigationEvents();
    bindBillFormEvents();
    bindCalculatorEvents();
    bindCarouselEvents();
    renderDashboard();
    renderHistory();
    renderConsumptionChart();
    showSection(getInitialSection());
  }

  /** Lê as contas salvas e protege a aplicação contra dados inválidos no storage. */
  function loadBills() {
    try {
      const storedBills = localStorage.getItem(STORAGE_KEY);
      const parsedBills = storedBills ? JSON.parse(storedBills) : [];
      if (!Array.isArray(parsedBills)) {
        return [];
      }

      return parsedBills
        .filter(isValidStoredBill)
        .map((bill) => ({
          id: String(bill.id),
          month: bill.month,
          consumption: Number(bill.consumption),
          amount: Number(bill.amount)
        }))
        .sort((first, second) => second.month.localeCompare(first.month));
    } catch (error) {
      announce('Não foi possível ler os dados salvos neste navegador.');
      return [];
    }
  }

  function isValidStoredBill(bill) {
    return bill
      && typeof bill === 'object'
      && typeof bill.id === 'string'
      && /^\d{4}-\d{2}$/.test(bill.month)
      && Number.isFinite(Number(bill.consumption))
      && Number(bill.consumption) > 0
      && Number.isFinite(Number(bill.amount))
      && Number(bill.amount) > 0;
  }

  /** Salva a lista inteira em um único registro versionado do Local Storage. */
  function persistBills() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bills));
      return true;
    } catch (error) {
      announce('Não foi possível salvar. Verifique o espaço disponível no navegador.');
      return false;
    }
  }

  function bindNavigationEvents() {
    elements.navigationButtons.forEach((button) => {
      button.addEventListener('click', () => showSection(button.dataset.section));
    });

    elements.shortcutButtons.forEach((button) => {
      button.addEventListener('click', () => showSection(button.dataset.goTo));
    });

    window.addEventListener('hashchange', () => {
      const section = getSectionFromHash();
      if (section) {
        showSection(section, false);
      }
    });
  }

  function bindBillFormEvents() {
    elements.billForm.addEventListener('submit', handleBillSubmit);
    elements.cancelEdit.addEventListener('click', resetBillForm);
  }

  function bindCalculatorEvents() {
    elements.calculatorForm.addEventListener('submit', handleCalculatorSubmit);
  }

  function bindCarouselEvents() {
    if (!elements.carouselTrack) {
      return;
    }

    document.querySelectorAll('[data-carousel-prev]').forEach((button) => {
      button.addEventListener('click', () => scrollCarousel(-1));
    });

    document.querySelectorAll('[data-carousel-next]').forEach((button) => {
      button.addEventListener('click', () => scrollCarousel(1));
    });
  }

  /** Rola o carrossel de dicas um card por vez, na direção indicada (-1 = anterior, 1 = próximo). */
  function scrollCarousel(direction) {
    const track = elements.carouselTrack;
    const firstCard = track && track.querySelector('.tip-card');
    if (!track || !firstCard) {
      return;
    }

    const trackStyle = window.getComputedStyle(track);
    const gap = Number.parseFloat(trackStyle.columnGap || trackStyle.gap) || 0;
    const scrollAmount = firstCard.getBoundingClientRect().width + gap;

    track.scrollBy({ left: scrollAmount * direction, behavior: 'smooth' });
  }

  function getInitialSection() {
    return getSectionFromHash() || 'dashboard';
  }

  function getSectionFromHash() {
    const section = window.location.hash.replace('#', '');
    return sections.includes(section) ? section : null;
  }

  /** Exibe somente uma seção e mantém o estado ativo na navegação. */
  function showSection(section, updateHash = true) {
    if (!sections.includes(section)) {
      return;
    }

    sections.forEach((sectionName) => {
      elements.sections[sectionName].hidden = sectionName !== section;
    });

    elements.navigationButtons.forEach((button) => {
      const isActive = button.dataset.section === section;
      button.classList.toggle('active', isActive);
      if (isActive) {
        button.setAttribute('aria-current', 'page');
      } else {
        button.removeAttribute('aria-current');
      }
    });

    if (updateHash && window.location.hash !== `#${section}`) {
      window.history.replaceState(null, '', `#${section}`);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Valida e cria ou atualiza uma conta. */
  function handleBillSubmit(event) {
    event.preventDefault();
    clearFormErrors();

    const formData = {
      id: elements.billId.value || createId(),
      month: elements.billMonth.value,
      consumption: Number(elements.billConsumption.value),
      amount: Number(elements.billAmount.value)
    };

    const validationErrors = validateBill(formData);
    if (Object.keys(validationErrors).length > 0) {
      showFormErrors(validationErrors);
      announce('Confira os campos destacados antes de salvar.');
      return;
    }

    const editingIndex = bills.findIndex((bill) => bill.id === formData.id);
    if (editingIndex >= 0) {
      bills[editingIndex] = formData;
    } else {
      bills.push(formData);
    }

    bills.sort((first, second) => second.month.localeCompare(first.month));

    if (!persistBills()) {
      return;
    }

    renderDashboard();
    renderHistory();
    renderConsumptionChart();
    showFormSuccess(editingIndex >= 0 ? 'Conta atualizada com sucesso.' : 'Conta salva com sucesso.');
    resetBillForm(false);
    announce('Conta salva com sucesso.');
    showSection('dashboard');
  }

  function validateBill(bill) {
    const errors = {};
    const currentDate = new Date();
    const currentMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

    if (!/^\d{4}-\d{2}$/.test(bill.month)) {
      errors.month = 'Escolha o mês da conta.';
    } else if (bill.month > currentMonth) {
      errors.month = 'Escolha um mês que já tenha acontecido.';
    }

    if (!Number.isFinite(bill.consumption) || bill.consumption <= 0) {
      errors.consumption = 'Digite um consumo maior que zero.';
    }

    if (!Number.isFinite(bill.amount) || bill.amount <= 0) {
      errors.amount = 'Digite um valor maior que zero.';
    }

    return errors;
  }

  function showFormErrors(errors) {
    const fields = {
      month: document.getElementById('bill-month'),
      consumption: document.getElementById('bill-consumption'),
      amount: document.getElementById('bill-amount')
    };

    Object.entries(fields).forEach(([name, field]) => {
      const errorElement = document.getElementById(`${name}-error`);
      const message = errors[name] || '';
      field.setAttribute('aria-invalid', message ? 'true' : 'false');
      errorElement.textContent = message;
    });

    const firstError = Object.keys(errors)[0];
    if (firstError) {
      fields[firstError].focus();
    }
  }

  function clearFormErrors() {
    showFormErrors({});
    elements.formMessage.textContent = '';
    elements.formMessage.className = 'form-message';
  }

  function showFormSuccess(message) {
    elements.formMessage.textContent = message;
    elements.formMessage.className = 'form-message success';
  }

  /** Preenche o formulário para edição sem criar uma segunda conta. */
  function startEditingBill(id) {
    const bill = bills.find((item) => item.id === id);
    if (!bill) {
      return;
    }

    elements.billId.value = bill.id;
    elements.billMonth.value = bill.month;
    elements.billConsumption.value = bill.consumption;
    elements.billAmount.value = bill.amount;
    elements.cancelEdit.hidden = false;
    elements.formMessage.textContent = 'Editando esta conta. Faça as mudanças e salve novamente.';
    elements.formMessage.className = 'form-message success';
    showSection('register');
    elements.billMonth.focus();
  }

  /** Exclui uma conta somente após confirmação explícita. */
  function deleteBill(id) {
    const bill = bills.find((item) => item.id === id);
    if (!bill) {
      return;
    }

    const formattedMonth = formatMonth(bill.month);
    const confirmed = window.confirm(`Excluir a conta de ${formattedMonth}?`);
    if (!confirmed) {
      return;
    }

    bills = bills.filter((item) => item.id !== id);
    if (persistBills()) {
      renderDashboard();
      renderHistory();
      renderConsumptionChart();
      announce('Conta excluída.');
    }
  }

  function resetBillForm(showMessage = true) {
    elements.billForm.reset();
    elements.billId.value = '';
    elements.cancelEdit.hidden = true;
    clearFormErrors();
    if (showMessage) {
      announce('Edição cancelada.');
    }
  }

  /** Atualiza os resumos que dependem da conta mais recente. */
  function renderDashboard() {
    elements.tariffName.textContent = currentTariff.name;
    elements.tariffDescription.textContent = currentTariff.description;

    const latestBill = bills[0];

    if (!latestBill) {
      elements.lastExpense.textContent = 'Ainda não há conta';
      elements.lastExpenseMonth.textContent = 'Registre sua primeira conta.';
      return;
    }

    elements.lastExpense.textContent = currencyFormatter.format(latestBill.amount);
    elements.lastExpenseMonth.textContent = `${formatMonth(latestBill.month)} · ${numberFormatter.format(latestBill.consumption)} kWh`;
  }

  /** Desenha o histórico e conecta as ações de editar e excluir. */
  function renderHistory() {
    elements.historyList.replaceChildren();
    elements.historyCount.textContent = `${bills.length} ${bills.length === 1 ? 'conta' : 'contas'}`;
    elements.emptyHistory.hidden = bills.length > 0;

    bills.forEach((bill) => {
      const item = document.createElement('article');
      item.className = 'history-item';
      item.innerHTML = `
        <div class="history-item-main">
          <div>
            <p class="history-month">${escapeHtml(formatMonth(bill.month))}</p>
            <p class="history-consumption">${numberFormatter.format(bill.consumption)} kWh</p>
          </div>
          <p class="history-amount">${currencyFormatter.format(bill.amount)}</p>
        </div>
        <div class="history-actions">
          <button class="small-button" type="button" data-edit-id="${escapeHtml(bill.id)}">Editar</button>
          <button class="small-button delete-button" type="button" data-delete-id="${escapeHtml(bill.id)}">Excluir</button>
        </div>
      `;

      item.querySelector('[data-edit-id]').addEventListener('click', () => startEditingBill(bill.id));
      item.querySelector('[data-delete-id]').addEventListener('click', () => deleteBill(bill.id));
      elements.historyList.appendChild(item);
    });
  }

  /**
   * Desenha o gráfico de consumo (kWh) e gasto (R$) por mês.
   * Sempre destrói a instância anterior antes de criar uma nova, para evitar
   * o erro "Canvas is already in use" ao salvar ou excluir uma conta.
   */
  function renderConsumptionChart() {
    if (!elements.chartCanvas || !elements.chartContainer) {
      return;
    }

    // O CDN pode falhar (sem internet, bloqueio de script) e o app não pode quebrar por isso.
    if (typeof Chart === 'undefined') {
      elements.chartContainer.hidden = true;
      return;
    }

    if (!Array.isArray(bills) || bills.length === 0) {
      elements.chartContainer.hidden = true;
      return;
    }

    elements.chartContainer.hidden = false;

    const billsByMonth = [...bills].sort((first, second) => first.month.localeCompare(second.month));
    const labels = billsByMonth.map((bill) => formatMonth(bill.month));
    const consumptionData = billsByMonth.map((bill) => bill.consumption);
    const amountData = billsByMonth.map((bill) => bill.amount);

    if (consumptionChart) {
      consumptionChart.destroy();
    }

    consumptionChart = new Chart(elements.chartCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Consumo (kWh)',
            data: consumptionData,
            borderColor: '#197a4a',
            backgroundColor: '#197a4a',
            yAxisID: 'yConsumption',
            tension: 0.3
          },
          {
            label: 'Valor (R$)',
            data: amountData,
            borderColor: '#0b6fa4',
            backgroundColor: '#0b6fa4',
            yAxisID: 'yAmount',
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        scales: {
          yConsumption: {
            type: 'linear',
            position: 'left',
            beginAtZero: true,
            title: { display: true, text: 'kWh' }
          },
          yAmount: {
            type: 'linear',
            position: 'right',
            beginAtZero: true,
            title: { display: true, text: 'R$' },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });
  }

  function handleCalculatorSubmit(event) {
    event.preventDefault();

    const power = Number(document.getElementById('appliance-power').value);
    const hours = Number(document.getElementById('daily-hours').value);
    const days = Number(document.getElementById('monthly-days').value);
    const kwhPrice = Number(document.getElementById('kwh-price').value);

    if (!isValidCalculatorInput(power, hours, days, kwhPrice)) {
      elements.calculatorResult.hidden = false;
      elements.calculatorResult.textContent = 'Confira os valores. Use números maiores que zero e até 24 horas por dia.';
      elements.calculatorResult.className = 'calculator-result error-result';
      announce('Confira os valores da calculadora.');
      return;
    }

    const estimatedKwh = (power * hours * days) / 1000;
    const estimatedCost = estimatedKwh * kwhPrice;
    elements.calculatorResult.hidden = false;
    elements.calculatorResult.className = 'calculator-result';
    elements.calculatorResult.innerHTML = `Estimativa de consumo: <strong>${numberFormatter.format(estimatedKwh)} kWh por mês</strong>Gasto estimado: <strong>${currencyFormatter.format(estimatedCost)} por mês</strong>`;
    announce(`Gasto estimado: ${currencyFormatter.format(estimatedCost)} por mês.`);
  }

  function isValidCalculatorInput(power, hours, days, kwhPrice) {
    return [power, hours, days, kwhPrice].every((value) => Number.isFinite(value) && value > 0)
      && hours <= 24
      && days <= 31;
  }

  function formatMonth(month) {
    const [year, monthNumber] = month.split('-');
    const date = new Date(Number(year), Number(monthNumber) - 1, 1);
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date);
  }

  function createId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  /** Evita que dados adulterados no Local Storage sejam interpretados como HTML. */
  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function announce(message) {
    elements.liveRegion.textContent = message;
  }

  init();
})();
