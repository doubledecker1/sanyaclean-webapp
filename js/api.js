/**
 * API Client for Operator Mini-App
 * Communicates with FastAPI backend
 */
class API {
    constructor() {
        // Base URL — will be set from Telegram WebApp data or fallback
        this.baseUrl = this._detectBaseUrl();
        this.token = null;
        this.tenantSlug = null;
    }

    _detectBaseUrl() {
        // In production: same origin as the API server
        // WebApp startParam can contain API URL
        const tg = window.Telegram?.WebApp;
        if (tg?.initDataUnsafe?.start_param) {
            try {
                const params = atob(tg.initDataUnsafe.start_param);
                const data = JSON.parse(params);
                if (data.api) return data.api;
            } catch (e) {}
        }
        // Cloudflare Tunnel URL
        return 'https://refused-renewable-detected-bicycle.trycloudflare.com';
    }

    setAuth(token, tenantSlug) {
        this.token = token;
        this.tenantSlug = tenantSlug;
    }

    async _fetch(path, options = {}) {
        const url = `${this.baseUrl}/api${path}`;
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        // Send Telegram initData for verification
        const tg = window.Telegram?.WebApp;
        if (tg?.initData) {
            headers['X-Telegram-Init-Data'] = tg.initData;
        }

        try {
            const resp = await fetch(url, { ...options, headers });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ detail: resp.statusText }));
                throw new Error(err.detail || `HTTP ${resp.status}`);
            }
            return await resp.json();
        } catch (e) {
            console.error(`API Error [${path}]:`, e);
            throw e;
        }
    }

    // === Conversations ===

    async getConversations(filter = 'active', page = 1, limit = 20) {
        return this._fetch(`/conversations?status=${filter}&page=${page}&limit=${limit}`);
    }

    async getConversation(id) {
        return this._fetch(`/conversations/${id}`);
    }

    async getMessages(conversationId, limit = 50) {
        return this._fetch(`/conversations/${conversationId}/messages?limit=${limit}`);
    }

    async sendMessage(conversationId, content) {
        return this._fetch(`/conversations/${conversationId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ content, role: 'operator' })
        });
    }

    async updateConversation(id, data) {
        return this._fetch(`/conversations/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    }

    async takeover(conversationId) {
        return this.updateConversation(conversationId, { action: 'takeover' });
    }

    async release(conversationId) {
        return this.updateConversation(conversationId, { action: 'release' });
    }

    async closeConversation(conversationId) {
        return this.updateConversation(conversationId, { action: 'close' });
    }

    // === Stats ===

    async getStats(period = 'week') {
        return this._fetch(`/stats?period=${period}`);
    }

    // === Settings ===

    async getTenantSettings() {
        return this._fetch(`/tenant/settings`);
    }

    async updateTenantSettings(data) {
        return this._fetch(`/tenant/settings`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    }

    async getKnowledgeBase() {
        return this._fetch(`/tenant/knowledge`);
    }

    async reloadKnowledgeBase() {
        return this._fetch(`/tenant/knowledge/reload`, { method: 'POST' });
    }

    // === Auth ===

    async authenticate() {
        const tg = window.Telegram?.WebApp;
        if (!tg?.initData) {
            throw new Error('No Telegram WebApp data');
        }
        const resp = await this._fetch('/auth/telegram', {
            method: 'POST',
            body: JSON.stringify({ init_data: tg.initData })
        });
        this.token = resp.token;
        this.tenantSlug = resp.tenant_slug;
        return resp;
    }
}

window.api = new API();
