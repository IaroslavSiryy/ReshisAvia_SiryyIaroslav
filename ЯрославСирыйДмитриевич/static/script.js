let chartInstance = null;
let modalChart = null;
let currentData = null;
let selectedCity = "";
let selectedDate = "";
let debounceTimer = null;

// ==== КАСТОМНОЕ ОКНО УВЕДОМЛЕНИЙ ====
let modalAction = null;

function showInfoModal(title, message, action = null) {
    document.getElementById('infoModalTitle').innerText = title;
    document.getElementById('infoModalMessage').innerText = message;
    modalAction = action;

    const modal = document.getElementById('infoModal');
    const content = document.getElementById('infoModalContent');

    // Показываем контейнер
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // Запускаем анимацию увеличения
    setTimeout(() => {
        content.classList.remove('scale-90');
        content.classList.add('scale-100');
    }, 10);
}

function closeInfoModal() {
    const modal = document.getElementById('infoModal');
    const content = document.getElementById('infoModalContent');

    // Анимация уменьшения
    content.classList.remove('scale-100');
    content.classList.add('scale-90');

    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');

        if (modalAction) {
            modalAction();
            modalAction = null;
        }
    }, 300);
}

// ==== ТЕМНАЯ ТЕМА ====
function updateThemeButtons() {
    const isDark = document.documentElement.classList.contains('dark');
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
        btn.innerText = isDark ? '☀️' : '🌙';
    });
}

function initTheme() {
    const isDark = localStorage.getItem('theme') === 'dark';
    if (isDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    updateThemeButtons();
}

function toggleTheme() {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeButtons();

    if (currentData) {
        setTimeout(() => {
            renderChart(currentData, 'demandChart', false);
            if (!document.getElementById('chartModal').classList.contains('hidden')) {
                renderChart(currentData, 'fullChart', true);
            }
        }, 100);
    }
}
initTheme();

// ==== КАРТИНКИ ====
const cityImages = {
    "Сочи": "sochi.jpg",
    "Санкт-Петербург": "spb.jpg",
    "Калининград": "kg.jpg",
    "Новосибирск": "nv.jpg",
    "Минеральные Воды": "mrv.jpg"
};

// ==== УВЕДОМЛЕНИЯ ====
function showToast(message, isError = false) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl font-bold text-lg ${
        isError ? 'bg-red-50 border-2 border-red-200 text-red-900' : 'bg-yellow-400 border-2 border-yellow-500 text-black'
    }`;
    toast.innerHTML = `<span class="text-2xl">${isError ? '❌' : '✨'}</span> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function updateBreadcrumbs(step) {
    ['bc-1', 'bc-2', 'bc-3'].forEach(id => {
        const el = document.getElementById(id);
        el.className = 'breadcrumb-item hidden text-gray-500 dark:text-gray-400';
    });
    const bc1 = document.getElementById('bc-1');
    bc1.classList.remove('hidden');
    if (step === 1) { bc1.classList.add('active'); bc1.classList.remove('text-gray-500', 'dark:text-gray-400'); } else bc1.classList.add('clickable');

    if (step >= 2) {
        const bc2 = document.getElementById('bc-2');
        bc2.classList.remove('hidden');
        if (step === 2) { bc2.classList.add('active'); bc2.classList.remove('text-gray-500', 'dark:text-gray-400'); } else bc2.classList.add('clickable');
        document.getElementById('bc-arrow-1').classList.remove('hidden');
    } else {
        document.getElementById('bc-arrow-1').classList.add('hidden');
    }

    if (step >= 3) {
        const bc3 = document.getElementById('bc-3');
        bc3.classList.remove('hidden');
        bc3.classList.add('active');
        bc3.classList.remove('text-gray-500', 'dark:text-gray-400');
        document.getElementById('bc-arrow-2').classList.remove('hidden');
    } else {
        document.getElementById('bc-arrow-2').classList.add('hidden');
    }
}

function goToStep(num) {
    document.querySelectorAll('.step').forEach(el => el.classList.add('hidden'));
    document.getElementById('step' + num).classList.remove('hidden');
    updateBreadcrumbs(num);
    if (num === 3 && currentData) {
        setTimeout(() => {
            if (!document.getElementById('step3').classList.contains('hidden')) {
                renderChart(currentData, 'demandChart', false);
            }
        }, 50);
    }
}

function switchTab(tab) {
    const lf = document.getElementById('login-form'), rf = document.getElementById('register-form');
    const tl = document.getElementById('tab-login'), tr = document.getElementById('tab-reg');
    if (tab === 'login') {
        lf.className = 'flex flex-col gap-4'; rf.className = 'hidden flex-col gap-4';
        tl.className = 'flex-1 py-3 rounded-lg font-bold text-lg bg-white dark:bg-gray-800 shadow-sm z-10 transition-all';
        tr.className = 'flex-1 py-3 rounded-lg font-medium text-lg text-gray-500 dark:text-gray-400 z-10 transition-all';
    } else {
        lf.className = 'hidden flex-col gap-4'; rf.className = 'flex flex-col gap-4';
        tr.className = 'flex-1 py-3 rounded-lg font-bold text-lg bg-white dark:bg-gray-800 shadow-sm z-10 transition-all';
        tl.className = 'flex-1 py-3 rounded-lg font-medium text-lg text-gray-500 dark:text-gray-400 z-10 transition-all';
    }
    document.getElementById('auth-error').innerText = '';
}

function showAuth() {
    document.getElementById('auth-view').classList.remove('hidden');
    document.getElementById('main-view').classList.add('hidden');
    document.getElementById('main-view').classList.remove('flex');
}

async function showMain() {
    document.getElementById('auth-view').classList.add('hidden');
    document.getElementById('main-view').classList.remove('hidden');
    document.getElementById('main-view').classList.add('flex');
    goToStep(1);
    await loadCities();
}

function logout() { localStorage.removeItem('token'); showAuth(); }

async function loadCities() {
    const list = document.getElementById('cities-list');
    list.innerHTML = '<p class="text-gray-400 font-medium col-span-full">Загрузка...</p>';
    try {
        const res = await fetch('/api/cities');
        const cities = await res.json();
        list.innerHTML = '';
        cities.forEach(city => {
            const imgUrl = cityImages[city] || "";
            const btn = document.createElement('button');
            btn.className = 'city-card rounded-2xl text-left flex flex-col';
            btn.innerHTML = `
                <div class="w-full city-img-wrapper">
                    <img src="${imgUrl}" alt="${city}" class="city-img">
                </div>
                <div class="p-4 bg-white dark:bg-gray-800 shrink-0">
                    <span class="block text-xl font-bold">${city}</span>
                </div>
            `;
            btn.onclick = () => selectCity(city);
            list.appendChild(btn);
        });
    } catch (e) { list.innerHTML = '<p class="text-red-500 font-bold">Ошибка загрузки</p>'; }
}

function selectCity(city) {
    selectedCity = city;
    document.getElementById('selected-city-text').innerText = `Москва → ${city}`;
    goToStep(2);
    loadDates(city);
}

async function loadDates(city) {
    const list = document.getElementById('dates-list');
    list.innerHTML = '<p class="text-gray-400 font-medium col-span-full">Загрузка...</p>';
    try {
        const res = await fetch('/api/dates/' + encodeURIComponent(city));
        const dates = await res.json();
        list.innerHTML = '';
        dates.forEach(d => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn p-3 rounded-xl flex flex-col items-center justify-center bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-yellow-400 hover:shadow-md transition-all';
            const dateObj = new Date(d);
            const day = dateObj.getDate();
            const month = dateObj.toLocaleDateString('ru-RU', { month: 'short' });
            const weekday = dateObj.toLocaleDateString('ru-RU', { weekday: 'short' });
            btn.innerHTML = `
                <span class="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">${weekday}</span>
                <span class="text-2xl font-extrabold leading-none mb-1">${day}</span>
                <span class="text-sm font-bold text-gray-500">${month}</span>
            `;
            btn.onclick = () => selectDate(d, dateObj);
            list.appendChild(btn);
        });
    } catch (e) { list.innerHTML = '<p class="text-red-500 font-bold">Ошибка</p>'; }
}

function selectDate(dateIso, dateObj) {
    selectedDate = dateIso;
    document.getElementById('selected-date-text').innerText = `Москва → ${selectedCity}, ${dateObj.toLocaleDateString('ru-RU')}`;
    goToStep(3);
    calculate();
}

async function calculate() {
    const token = localStorage.getItem('token');
    const price = parseFloat(document.getElementById('price').value);
    try {
        const res = await fetch('/api/forecast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ origin: "Москва", destination: selectedCity, date: selectedDate, price: price })
        });
        const data = await res.json();
        if (res.ok) {
            document.getElementById('resSeats').innerText = data.seats;
            document.getElementById('resWant').innerText = data.want_to_buy;
            document.getElementById('resBuy').innerText = data.will_buy;
            document.getElementById('resProfit').innerText = data.profit.toLocaleString('ru-RU') + ' ₽';
            currentData = data;
            renderChart(data, 'demandChart', false);
            if (!document.getElementById('chartModal').classList.contains('hidden')) {
                renderChart(data, 'fullChart', true);
            }
        }
    } catch (error) { console.error("Ошибка соединения"); }
}

function scheduleCalculate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(calculate, 150);
}

async function getOptimalPrice() {
    const token = localStorage.getItem('token');
    const btn1 = document.getElementById('btn-optimal');
    const btn2 = document.getElementById('btn-optimal-modal');

    if(btn1) { btn1.innerHTML = '⏳ Считаем...'; btn1.disabled = true; }
    if(btn2) { btn2.innerHTML = '⏳ Считаем...'; btn2.disabled = true; }

    try {
        const res = await fetch('/api/optimal_price', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ origin: "Москва", destination: selectedCity, date: selectedDate })
        });
        const data = await res.json();
        if (res.ok) {
            document.getElementById('price').value = data.optimal_price;
            document.getElementById('price-slider').value = data.optimal_price;
            document.getElementById('price-modal').value = data.optimal_price;
            document.getElementById('price-slider-modal').value = data.optimal_price;
            calculate();
            showToast(`Рекомендуемая цена: ${data.optimal_price} ₽. Ожидаемая прибыль: ${data.expected_profit.toLocaleString('ru-RU')} ₽`);
        } else {
            showToast("Ошибка: " + data.detail, true);
        }
    } catch (e) {
        showToast("Ошибка соединения", true);
    } finally {
        if(btn1) { btn1.innerHTML = '✨ Оптимальная цена'; btn1.disabled = false; }
        if(btn2) { btn2.innerHTML = '✨ Оптимальная цена'; btn2.disabled = false; }
    }
}

// ===== ГРАФИК С ПРИБЫЛЬЮ =====
function renderChart(data, containerId, isFull) {
    if (typeof ApexCharts === 'undefined') return;
    const labels = [], wantData = [], buyData = [], profitData = [];

    for (let key in data.quantiles) {
        labels.push('Сценарий ' + key);
        wantData.push(data.quantiles[key].want);
        buyData.push(data.quantiles[key].buy);
        profitData.push(data.quantiles[key].profit / 1000);
    }

    if (containerId === 'demandChart' && chartInstance) chartInstance.destroy();
    if (containerId === 'fullChart' && modalChart) modalChart.destroy();

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#F4F4F4' : '#333333';

    const options = {
        chart: {
            type: 'line',
            height: isFull ? 500 : 400,
            width: '100%',
            fontFamily: 'Inter',
            toolbar: { show: false },
            animations: { enabled: true, easing: 'easeinout', speed: 800 },
            zoom: { enabled: false },
            selection: { enabled: false },
            background: 'transparent'
        },
        series: [
            { name: 'Хотят купить (чел.)', type: 'area', data: wantData },
            { name: 'Купят (чел.)', type: 'line', data: buyData },
            { name: 'Прибыль (тыс. ₽)', type: 'line', data: profitData, yaxis: 1 }
        ],
        colors: ['#facc15', isDark ? '#9ca3af' : '#111827', '#10b981'],
        stroke: { curve: 'smooth', width: isFull ? 4 : 3, dashArray: [0, 5, 0] },
        fill: { type: ['gradient', 'solid', 'solid'], gradient: { opacityFrom: 0.5, opacityTo: 0.1 } },
        dataLabels: { enabled: false },
        xaxis: {
            categories: labels,
            labels: { style: { fontWeight: 600, colors: textColor } }
        },
        yaxis: [
            {
                min: 0,
                title: { text: 'Пассажиры', style: { fontWeight: 600, color: textColor } },
                labels: { style: { fontWeight: 600, colors: textColor }, formatter: function(val) { return Math.round(val); } }
            },
            {
                opposite: true,
                title: { text: 'Прибыль (тыс. ₽)', style: { fontWeight: 600, color: '#10b981' } },
                labels: { style: { fontWeight: 600, colors: '#10b981' }, formatter: function(val) { return Math.round(val); } }
            }
        ],
        legend: {
            show: true,
            position: 'bottom',
            horizontalAlign: 'center',
            fontWeight: 600,
            fontSize: isFull ? '16px' : '14px',
            markers: { size: 6 },
            itemMargin: { horizontal: 10, vertical: 10 },
            onItemClick: { toggleDataSeries: true },
            onItemHover: { highlightDataSeries: true },
            labels: { colors: textColor }
        },
        tooltip: {
            enabled: true,
            theme: isDark ? 'dark' : 'light',
            style: { fontSize: '14px', fontFamily: 'Inter' },
            y: {
                formatter: function (val, { seriesIndex }) {
                    return seriesIndex === 2 ? val.toFixed(1) + " тыс. ₽" : Math.round(val) + " чел.";
                }
            }
        },
        grid: { borderColor: isDark ? '#374151' : '#f3f4f6', strokeDashArray: 4 }
    };

    if (containerId === 'demandChart') {
        chartInstance = new ApexCharts(document.querySelector('#demandChart'), options);
        chartInstance.render();
    } else {
        modalChart = new ApexCharts(document.querySelector('#fullChart'), options);
        modalChart.render();
    }
}

function openChartModal() {
    if (!currentData) return;
    document.getElementById('price-modal').value = document.getElementById('price').value;
    document.getElementById('price-slider-modal').value = document.getElementById('price').value;
    document.getElementById('chartModal').classList.remove('hidden');
    setTimeout(() => renderChart(currentData, 'fullChart', true), 150);
}

function closeChartModal() {
    document.getElementById('chartModal').classList.add('hidden');
    if (modalChart) { modalChart.destroy(); modalChart = null; }
}

document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem('token');
    if (token) showMain(); else showAuth();

    const priceInput = document.getElementById('price');
    const priceSlider = document.getElementById('price-slider');
    priceSlider.addEventListener('input', (e) => { priceInput.value = e.target.value; scheduleCalculate(); });
    priceInput.addEventListener('input', (e) => {
        let val = parseInt(e.target.value);
        if (val >= 1000 && val <= 20000) priceSlider.value = val;
        scheduleCalculate();
    });

    const priceModal = document.getElementById('price-modal');
    const priceSliderModal = document.getElementById('price-slider-modal');
    priceSliderModal.addEventListener('input', (e) => {
        priceModal.value = e.target.value; priceInput.value = e.target.value; priceSlider.value = e.target.value; scheduleCalculate();
    });
    priceModal.addEventListener('input', (e) => {
        let val = parseInt(e.target.value);
        if (val >= 1000 && val <= 20000) priceSliderModal.value = val;
        priceInput.value = e.target.value; priceSlider.value = e.target.value; scheduleCalculate();
    });
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('login-username').value, p = document.getElementById('login-password').value;
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
    const data = await res.json();
    if (res.ok) { localStorage.setItem('token', data.access_token); showMain(); }
    else { document.getElementById('auth-error').innerText = data.detail; }
});

// ОБРАБОТЧИК РЕГИСТРАЦИИ С КРАСИВЫМ ОКНОМ
document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const c = document.getElementById('reg-code').value;
    const u = document.getElementById('reg-username').value;
    const p = document.getElementById('reg-password').value;

    const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_code: c, username: u, password: p })
    });
    const data = await res.json();

    if (res.ok) {
        document.getElementById('reg-code').value = '';
        document.getElementById('reg-username').value = '';
        document.getElementById('reg-password').value = '';

        // Показываем окно, переключение вкладки произойдет только после нажатия ОК
        showInfoModal(
            "Регистрация успешна!",
            "Аккаунт создан. Теперь вы можете войти в систему.",
            () => { switchTab('login'); }
        );
    }
    else {
        document.getElementById('auth-error').innerText = data.detail;
    }
});