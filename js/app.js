/**
 * Operator Mini-App — Main Application
 */
(function() {
    const tg = window.Telegram?.WebApp;
    let currentTab = 'dialogs';
    let currentConversation = null;
    let conversations = [];
    let pollInterval = null;

    // === Init ===
    function init() {
        if (tg) {
            tg.ready();
            tg.expand();
            tg.enableClosingConfirmation();
            document.body.style.setProperty('--bg', tg.themeParams.bg_color || '#1a1a2e');
            document.body.style.setProperty('--bg-secondary', tg.themeParams.secondary_bg_color || '#16213e');
        }

        setupNavigation();
        setupChat();
        setupSettings();
        setupFilters();
        loadDialogs();
        startPolling();
    }

    // === Navigation ===
    function setupNavigation() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                switchTab(btn.dataset.tab);
            });
        });
    }

    function switchTab(tab) {
        currentTab = tab;
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
        document.getElementById(`tab-${tab}`).classList.add('active');

        if (tab === 'stats') loadStats();
        if (tab === 'settings') loadSettings();
        if (tab === 'dialogs') loadDialogs();
    }

    // === Filters ===
    function setupFilters() {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                loadDialogs(btn.dataset.filter);
            });
        });
    }

    // === Dialogs ===
    async function loadDialogs(filter = 'active') {
        const list = document.getElementById('dialogs-list');
        try {
            const data = await api.getConversations(filter);
            conversations = data.conversations || data || [];
            renderDialogs(conversations, list);
        } catch (e) {
            // Demo mode if API not available
            conversations = getDemoDialogs(filter);
            renderDialogs(conversations, list);
        }
    }

    function renderDialogs(items, container) {
        if (!items.length) {
            container.innerHTML = '<div class="empty-state">Нет диалогов</div>';
            return;
        }

        container.innerHTML = items.map(d => `
            <div class="dialog-item" data-id="${d.id}" onclick="window.openChat(${d.id})">
                <div class="dialog-avatar">${getInitials(d.client_name)}</div>
                <div class="dialog-content">
                    <div class="dialog-top">
                        <span class="dialog-name">${escHtml(d.client_name || 'Клиент')}</span>
                        <span class="dialog-time">${formatTime(d.updated_at)}</span>
                    </div>
                    <div class="dialog-preview">${escHtml(d.last_message || '...')}</div>
                </div>
                <div class="dialog-meta">
                    <span class="status-dot ${d.status}"></span>
                    ${d.unread ? `<span class="badge">${d.unread}</span>` : ''}
                </div>
            </div>
        `).join('');
    }

    // === Chat ===
    function setupChat() {
        document.getElementById('chat-back').addEventListener('click', () => {
            switchTab('dialogs');
        });

        document.getElementById('btn-send').addEventListener('click', sendMessage);

        const input = document.getElementById('chat-input');
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // Auto-resize textarea
        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        });

        document.getElementById('btn-takeover').addEventListener('click', async () => {
            if (!currentConversation) return;
            try {
                await api.takeover(currentConversation.id);
                currentConversation.status = 'escalated';
                updateChatHeader();
                showToast('Диалог перехвачен');
            } catch (e) {
                currentConversation.is_taken = true;
                updateChatHeader();
                showToast('Перехвачен (демо)');
            }
        });

        document.getElementById('btn-release').addEventListener('click', async () => {
            if (!currentConversation) return;
            try {
                await api.release(currentConversation.id);
                currentConversation.status = 'active';
                updateChatHeader();
                showToast('AI вернулся');
            } catch (e) {
                currentConversation.is_taken = false;
                updateChatHeader();
                showToast('AI вернулся (демо)');
            }
        });

        document.getElementById('btn-close').addEventListener('click', async () => {
            if (!currentConversation) return;
            if (!confirm('Закрыть диалог?')) return;
            try {
                await api.closeConversation(currentConversation.id);
                showToast('Диалог закрыт');
                switchTab('dialogs');
            } catch (e) {
                showToast('Закрыт (демо)');
                switchTab('dialogs');
            }
        });
    }

    window.openChat = async function(id) {
        const conv = conversations.find(c => c.id === id);
        if (!conv) return;

        currentConversation = conv;
        switchTab('chat');
        updateChatHeader();

        const msgContainer = document.getElementById('chat-messages');
        document.getElementById('chat-input-area').style.display = 'flex';

        try {
            const data = await api.getMessages(id);
            renderMessages(data.messages || data || []);
        } catch (e) {
            // Demo messages
            renderMessages(getDemoMessages(id));
        }
    };

    function updateChatHeader() {
        const c = currentConversation;
        if (!c) return;
        document.getElementById('chat-name').textContent = c.client_name || 'Клиент';

        const badge = document.getElementById('chat-status');
        badge.textContent = c.status === 'escalated' ? 'оператор' : c.status;
        badge.className = `status-badge ${c.status}`;

        const isTaken = c.status === 'escalated' || c.is_taken;
        document.getElementById('btn-takeover').style.display = isTaken ? 'none' : '';
        document.getElementById('btn-release').style.display = isTaken ? '' : 'none';
    }

    function renderMessages(messages) {
        const container = document.getElementById('chat-messages');
        container.innerHTML = messages.map(m => `
            <div class="msg msg-${m.role}">
                <div>${escHtml(m.content)}</div>
                <div class="msg-meta">
                    <span class="msg-role">${getRoleName(m.role)}</span>
                    <span class="msg-time">${formatTime(m.created_at)}</span>
                </div>
            </div>
        `).join('');
        container.scrollTop = container.scrollHeight;
    }

    async function sendMessage() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text || !currentConversation) return;

        input.value = '';
        input.style.height = 'auto';

        // Optimistic UI
        const container = document.getElementById('chat-messages');
        container.innerHTML += `
            <div class="msg msg-operator">
                <div>${escHtml(text)}</div>
                <div class="msg-meta">
                    <span class="msg-role">Оператор</span>
                    <span class="msg-time">сейчас</span>
                </div>
            </div>
        `;
        container.scrollTop = container.scrollHeight;

        try {
            await api.sendMessage(currentConversation.id, text);
        } catch (e) {
            // Demo — message already shown
        }
    }

    // === Stats ===
    async function loadStats() {
        const period = document.getElementById('stats-period').value;
        try {
            const data = await api.getStats(period);
            renderStats(data);
        } catch (e) {
            renderStats(getDemoStats());
        }

        document.getElementById('stats-period').onchange = loadStats;
    }

    function renderStats(data) {
        document.getElementById('stat-total').textContent = data.total_conversations ?? '—';
        document.getElementById('stat-active').textContent = data.active ?? '—';
        document.getElementById('stat-escalated').textContent = data.escalated ?? '—';
        document.getElementById('stat-messages').textContent = data.total_messages ?? '—';
        document.getElementById('stat-avg-response').textContent = data.avg_response_time ?? '—';
        document.getElementById('stat-ai-rate').textContent = data.ai_resolution_rate ?? '—';

        renderChart(data.daily || []);
    }

    function renderChart(dailyData) {
        const canvas = document.getElementById('chart-messages');
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        canvas.width = canvas.offsetWidth * dpr;
        canvas.height = canvas.offsetHeight * dpr;
        ctx.scale(dpr, dpr);

        const w = canvas.offsetWidth;
        const h = canvas.offsetHeight;
        const padding = { top: 10, right: 10, bottom: 30, left: 35 };

        ctx.clearRect(0, 0, w, h);

        if (!dailyData.length) {
            dailyData = getDemoDailyData();
        }

        const maxVal = Math.max(...dailyData.map(d => d.count), 1);
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;
        const barW = Math.min(chartW / dailyData.length - 4, 30);

        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (chartH / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(w - padding.right, y);
            ctx.stroke();

            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(Math.round(maxVal - (maxVal / 4) * i), padding.left - 6, y + 4);
        }

        // Bars
        const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#4361ee';
        dailyData.forEach((d, i) => {
            const x = padding.left + (chartW / dailyData.length) * i + (chartW / dailyData.length - barW) / 2;
            const barH = (d.count / maxVal) * chartH;
            const y = padding.top + chartH - barH;

            ctx.fillStyle = accent;
            ctx.beginPath();
            ctx.roundRect(x, y, barW, barH, [4, 4, 0, 0]);
            ctx.fill();

            // Label
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(d.label, x + barW / 2, h - 8);
        });
    }

    // === Settings ===
    async function loadSettings() {
        try {
            const data = await api.getTenantSettings();
            fillSettings(data);
        } catch (e) {
            fillSettings(getDemoSettings());
        }
    }

    function fillSettings(data) {
        document.getElementById('set-system-prompt').value = data.system_prompt || '';
        document.getElementById('set-welcome').value = data.welcome_message || '';
        document.getElementById('set-model').value = data.ai_model || 'claude-sonnet-4-20250514';
        document.getElementById('set-max-tokens').value = data.max_tokens || 1024;

        const kbList = document.getElementById('kb-sections');
        if (data.knowledge_sections?.length) {
            kbList.innerHTML = data.knowledge_sections.map(s => `
                <div class="kb-item">
                    <span class="kb-item-name">${escHtml(s.name)}</span>
                    <span class="kb-item-size">${s.entries} записей</span>
                </div>
            `).join('');
        } else {
            kbList.innerHTML = '<div class="empty-state" style="height:60px;font-size:13px">Нет секций</div>';
        }
    }

    function setupSettings() {
        document.getElementById('btn-save-settings').addEventListener('click', async () => {
            const data = {
                system_prompt: document.getElementById('set-system-prompt').value,
                welcome_message: document.getElementById('set-welcome').value,
                ai_model: document.getElementById('set-model').value,
                max_tokens: parseInt(document.getElementById('set-max-tokens').value)
            };
            try {
                await api.updateTenantSettings(data);
                showToast('Сохранено');
            } catch (e) {
                showToast('Сохранено (демо)');
            }
        });

        document.getElementById('btn-reload-kb').addEventListener('click', async () => {
            try {
                await api.reloadKnowledgeBase();
                showToast('База знаний обновлена');
                loadSettings();
            } catch (e) {
                showToast('Обновлено (демо)');
            }
        });
    }

    // === Polling ===
    function startPolling() {
        pollInterval = setInterval(() => {
            if (currentTab === 'dialogs') {
                const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'active';
                loadDialogs(activeFilter);
            }
        }, 10000);
    }

    // === Helpers ===
    function getInitials(name) {
        if (!name) return '?';
        return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    }

    function formatTime(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        const now = new Date();
        const diff = now - d;

        if (diff < 60000) return 'только что';
        if (diff < 3600000) return Math.floor(diff / 60000) + ' мин';
        if (diff < 86400000) return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
        return d.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
    }

    function getRoleName(role) {
        const names = { client: 'Клиент', assistant: 'AI', operator: 'Оператор', system: 'Система' };
        return names[role] || role;
    }

    function escHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function showToast(msg) {
        if (tg?.showAlert) {
            tg.showAlert(msg);
        } else {
            const toast = document.createElement('div');
            toast.style.cssText = `
                position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
                background:rgba(0,0,0,0.8);color:#fff;padding:10px 20px;
                border-radius:20px;font-size:14px;z-index:999;
                animation:fadeIn 0.2s ease;
            `;
            toast.textContent = msg;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2000);
        }
    }

    // === Demo Data ===
    function getDemoDialogs(filter) {
        const all = [
            { id: 1, client_name: 'Алексей Иванов', status: 'active', last_message: 'Сколько стоит чистка кроссовок?', updated_at: new Date(Date.now() - 300000).toISOString(), unread: 2 },
            { id: 2, client_name: 'Мария Петрова', status: 'escalated', last_message: 'Хочу поговорить с менеджером', updated_at: new Date(Date.now() - 900000).toISOString(), unread: 1 },
            { id: 3, client_name: 'Дмитрий Козлов', status: 'active', last_message: 'Записался на завтра, спасибо!', updated_at: new Date(Date.now() - 3600000).toISOString(), unread: 0 },
            { id: 4, client_name: 'Елена Сидорова', status: 'closed', last_message: 'Всё отлично, забрал обувь', updated_at: new Date(Date.now() - 86400000).toISOString(), unread: 0 },
            { id: 5, client_name: 'Артём Николаев', status: 'active', last_message: 'А вы ремонт подошвы делаете?', updated_at: new Date(Date.now() - 7200000).toISOString(), unread: 1 },
        ];
        if (filter === 'all') return all;
        return all.filter(d => d.status === filter);
    }

    function getDemoMessages(convId) {
        const msgs = {
            1: [
                { role: 'client', content: 'Здравствуйте! Сколько стоит чистка кроссовок?', created_at: new Date(Date.now() - 600000).toISOString() },
                { role: 'assistant', content: 'Здравствуйте! Стандартная чистка кроссовок — 2 500₽, глубокая чистка (HydroTech) — 2 800₽. Если нужна премиальная реставрация — 3 000₽. Что вас интересует?', created_at: new Date(Date.now() - 540000).toISOString() },
                { role: 'client', content: 'А по времени сколько?', created_at: new Date(Date.now() - 300000).toISOString() },
                { role: 'assistant', content: 'Стандартная чистка — 2-3 дня, HydroTech — 3-5 дней. Можете принести на Шукшина 11 или Масленникова 28.', created_at: new Date(Date.now() - 240000).toISOString() },
            ],
            2: [
                { role: 'client', content: 'У меня проблема с заказом', created_at: new Date(Date.now() - 1800000).toISOString() },
                { role: 'assistant', content: 'Опишите проблему, я постараюсь помочь.', created_at: new Date(Date.now() - 1740000).toISOString() },
                { role: 'client', content: 'Хочу поговорить с менеджером', created_at: new Date(Date.now() - 900000).toISOString() },
                { role: 'system', content: 'Диалог передан оператору', created_at: new Date(Date.now() - 890000).toISOString() },
            ],
        };
        return msgs[convId] || [
            { role: 'client', content: 'Привет!', created_at: new Date(Date.now() - 3600000).toISOString() },
            { role: 'assistant', content: 'Здравствуйте! Чем могу помочь?', created_at: new Date(Date.now() - 3500000).toISOString() },
        ];
    }

    function getDemoStats() {
        return {
            total_conversations: 47,
            active: 8,
            escalated: 2,
            total_messages: 312,
            avg_response_time: '1.2с',
            ai_resolution_rate: '87%',
            daily: getDemoDailyData()
        };
    }

    function getDemoDailyData() {
        const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        return days.map(d => ({ label: d, count: Math.floor(Math.random() * 50) + 10 }));
    }

    function getDemoSettings() {
        return {
            system_prompt: 'Ты — AI-менеджер химчистки SANYA CLEAN. Отвечай вежливо, помогай с ценами и записью.',
            welcome_message: 'Привет! Я AI-менеджер SANYA CLEAN. Чем помочь?',
            ai_model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            knowledge_sections: [
                { name: 'prices.yml', entries: 12 },
                { name: 'objections.yml', entries: 8 },
                { name: 'scripts.yml', entries: 15 }
            ]
        };
    }

    // Init on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
