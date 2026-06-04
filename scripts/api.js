/**
 * API Service for PSN Welfare Registry - Vercel Compatible
 */

// Use config from utils or fallback
const CONFIG = window.CONFIG || {
    ENV: process.env.NODE_ENV || 'development',
    API_URL: '/api'
};

// Get API base URL - use function from config or fallback
const API_BASE_URL = window.getApiEndpoint ? window.getApiEndpoint('') : CONFIG.API_URL;

// Common headers for authenticated requests
function getAuthHeaders(contentType = 'application/json') {
    const token = localStorage.getItem('psn_welfare_token');
    const headers = {
        'Accept': 'application/json'
    };

    if (contentType) {
        headers['Content-Type'] = contentType;
    }

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
}

// Handle API responses with better error handling
async function handleResponse(response) {
    // Check for network errors
    if (!response) {
        throw new Error('Network error: No response from server');
    }

    // Handle HTTP status codes
    if (response.status === 401) {
        // Unauthorized - clear local storage and redirect
        localStorage.removeItem('psn_welfare_token');
        localStorage.removeItem('psn_welfare_user');

        // Only redirect if not already on login page
        if (!window.location.pathname.includes('/login.html')) {
            setTimeout(() => {
                window.location.href = '/pages/login.html';
            }, 100);
        }

        throw new Error('Session expired. Please login again.');
    }

    if (response.status === 403) {
        throw new Error('Access forbidden. You do not have permission for this action.');
    }

    if (response.status === 404) {
        throw new Error('Resource not found.');
    }

    if (response.status === 429) {
        throw new Error('Too many requests. Please try again later.');
    }

    if (response.status >= 500) {
        throw new Error('Server error. Please try again later.');
    }

    if (!response.ok) {
        try {
            const error = await response.json();
            throw new Error(error.message || error.error || `API request failed with status ${response.status}`);
        } catch (parseError) {
            throw new Error(`API request failed with status ${response.status}`);
        }
    }

    // Handle empty responses (204 No Content)
    if (response.status === 204) {
        return { success: true };
    }

    // Parse JSON response
    try {
        return await response.json();
    } catch (error) {
        throw new Error('Failed to parse server response');
    }
}

// Generic fetch wrapper with timeout
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
            throw new Error('Request timeout. Please check your connection and try again.');
        }
        throw error;
    }
}

// Make authenticated API request
async function makeRequest(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}/${endpoint.replace(/^\//, '')}`;

    const requestOptions = {
        ...options,
        headers: {
            ...getAuthHeaders(options.headers?.['Content-Type'] || 'application/json'),
            ...options.headers
        },
        credentials: 'include' // Include cookies for cross-origin requests
    };

    try {
        const response = await fetchWithTimeout(url, requestOptions);
        return await handleResponse(response);
    } catch (error) {
        // Don't show notification for auth redirects
        if (!error.message.includes('Session expired') && !error.message.includes('Access forbidden')) {
            console.error('API request failed:', error);

            // Only show notification if window.showNotification exists
            if (typeof window.showNotification === 'function') {
                window.showNotification(error.message || 'API request failed', 'error');
            }
        }
        throw error;
    }
}

const ApiService = {
    // Auth endpoints
    async register(userData) {
        return makeRequest('auth/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
    },

    async login(credentials) {
        return makeRequest('auth/login', {
            method: 'POST',
            body: JSON.stringify(credentials)
        });
    },

    async logout() {
        try {
            await makeRequest('auth/logout', {
                method: 'POST'
            });
        } finally {
            // Always clear local storage
            localStorage.removeItem('psn_welfare_token');
            localStorage.removeItem('psn_welfare_user');
        }
    },

    async refreshToken() {
        const token = localStorage.getItem('psn_welfare_token');
        if (!token) throw new Error('No token to refresh');

        return makeRequest('auth/refresh', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
    },

    // User endpoints
    async getCurrentUserProfile() {
        return makeRequest('users/me');
    },

    async updateUserProfile(updates) {
        return makeRequest('users/me', {
            method: 'PUT',
            body: JSON.stringify(updates)
        });
    },

    async changePassword(passwordData) {
        return makeRequest('users/change-password', {
            method: 'POST',
            body: JSON.stringify(passwordData)
        });
    },

    // Admin endpoints
    async getAdminStats() {
        return makeRequest('admin/stats');
    },

    async getAllMembers(page = 1, limit = 10, filters = {}) {
        const queryParams = new URLSearchParams({
            page: page.toString(),
            limit: limit.toString(),
            ...Object.fromEntries(
                Object.entries(filters)
                    .filter(([_, value]) => value !== null && value !== undefined && value !== '')
                    .map(([key, value]) => [key, value.toString()])
            )
        });

        return makeRequest(`admin/members?${queryParams}`);
    },

    async getMemberDetails(memberId) {
        return makeRequest(`admin/members/${memberId}`);
    },

    async updateMember(memberId, updates) {
        return makeRequest(`admin/members/${memberId}`, {
            method: 'PUT',
            body: JSON.stringify(updates)
        });
    },

    async deleteMembers(memberIds) {
        return makeRequest('admin/members/bulk', {
            method: 'DELETE',
            body: JSON.stringify({ memberIds })
        });
    },

    async getReminderLogs(filters = {}) {
        const queryParams = new URLSearchParams(
            Object.fromEntries(
                Object.entries(filters)
                    .filter(([_, value]) => value !== null && value !== undefined && value !== '')
                    .map(([key, value]) => [key, value.toString()])
            )
        );

        const queryString = queryParams.toString();
        const url = queryString ? `admin/reminder-logs?${queryString}` : 'admin/reminder-logs';

        return makeRequest(url);
    },

    async getUpcomingEvents(days = 30) {
        return makeRequest(`admin/upcoming-events?days=${days}`);
    },

    async getSystemLogs(page = 1, limit = 50, filters = {}) {
        const queryParams = new URLSearchParams({
            page: page.toString(),
            limit: limit.toString(),
            ...Object.fromEntries(
                Object.entries(filters)
                    .filter(([_, value]) => value !== null && value !== undefined && value !== '')
                    .map(([key, value]) => [key, value.toString()])
            )
        });

        return makeRequest(`admin/audit-logs?${queryParams}`);
    },

    // Report endpoints
    async generateReport(reportType, params = {}) {
        return makeRequest(`admin/reports/${reportType}`, {
            method: 'POST',
            body: JSON.stringify(params)
        });
    },

    async downloadReport(reportId, format = 'pdf') {
        const response = await fetchWithTimeout(`${API_BASE_URL}/admin/reports/${reportId}/download?format=${format}`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || 'Download failed');
        }

        // Handle file download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report_${reportId}_${new Date().toISOString().split('T')[0]}.${format}`;
        document.body.appendChild(a);
        a.click();

        // Cleanup
        setTimeout(() => {
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }, 100);

        return { success: true };
    },

    // Bulk actions
    async sendBulkEmails(emailData) {
        return makeRequest('admin/bulk/emails', {
            method: 'POST',
            body: JSON.stringify(emailData)
        });
    },

    async sendBulkReminders(reminderData) {
        return makeRequest('admin/bulk/reminders', {
            method: 'POST',
            body: JSON.stringify(reminderData)
        });
    },

    // Backup endpoints
    async createBackup() {
        return makeRequest('admin/backup', {
            method: 'POST'
        });
    },

    async getBackups() {
        return makeRequest('admin/backups');
    },

    async restoreBackup(backupId) {
        return makeRequest(`admin/backup/${backupId}/restore`, {
            method: 'POST'
        });
    },

    async exportData(format = 'json') {
        const response = await fetchWithTimeout(`${API_BASE_URL}/admin/export?format=${format}`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || 'Export failed');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `psn_welfare_export_${new Date().toISOString().split('T')[0]}.${format}`;
        document.body.appendChild(a);
        a.click();

        // Cleanup
        setTimeout(() => {
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }, 100);

        return { success: true };
    },

    // Settings endpoints
    async getSystemSettings() {
        return makeRequest('admin/settings');
    },

    async updateSystemSettings(settings) {
        return makeRequest('admin/settings', {
            method: 'PUT',
            body: JSON.stringify(settings)
        });
    },

    // Real-time monitoring
    async subscribeToUpdates(callback) {
        // Check if WebSockets are enabled
        if (CONFIG.FEATURES?.WEBSOCKETS && window.wsClient) {
            window.wsClient.on('message', callback);
            return () => window.wsClient.off('message', callback);
        }

        // Fallback to polling
        const intervalId = setInterval(async () => {
            try {
                const updates = await this.getRecentActivity();
                callback(updates);
            } catch (error) {
                console.error('Update polling error:', error);
            }
        }, 30000); // Poll every 30 seconds

        return () => clearInterval(intervalId);
    },

    async getRecentActivity(limit = 10) {
        return makeRequest(`admin/activity?limit=${limit}`);
    },

    // File upload helper
    async uploadFile(file, endpoint = 'upload', fieldName = 'file') {
        const formData = new FormData();
        formData.append(fieldName, file);

        return makeRequest(endpoint, {
            method: 'POST',
            headers: getAuthHeaders(null), // No content-type for FormData
            body: formData
        });
    },

    // News management
    async getNews(params = {}) {
        const qs = new URLSearchParams(
            Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''))
        ).toString();
        return makeRequest(`news${qs ? '?' + qs : ''}`);
    },

    async getNewsPost(id) {
        return makeRequest(`news/${id}`);
    },

    async createNews(data) {
        if (data instanceof FormData) {
            return makeRequest('news', {
                method: 'POST',
                headers: getAuthHeaders(null),
                body: data
            });
        }
        return makeRequest('news', { method: 'POST', body: JSON.stringify(data) });
    },

    async updateNews(id, data) {
        if (data instanceof FormData) {
            return makeRequest(`news/${id}`, {
                method: 'PUT',
                headers: getAuthHeaders(null),
                body: data
            });
        }
        return makeRequest(`news/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },

    async deleteNews(id) {
        return makeRequest(`news/${id}`, { method: 'DELETE' });
    },

    async uploadNewsImage(id, file) {
        const formData = new FormData();
        formData.append('coverImage', file);
        return makeRequest(`news/${id}/image`, {
            method: 'POST',
            headers: getAuthHeaders(null),
            body: formData
        });
    },

    // Health check
    async healthCheck() {
        try {
            const response = await fetchWithTimeout(`${API_BASE_URL}/health`, {}, 5000);
            return {
                ok: response.ok,
                status: response.status,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                ok: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
};

// Add interceptor for token refresh
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

// Intercept 401 errors and try to refresh token
const originalMakeRequest = makeRequest;
window.makeRequest = async function (endpoint, options = {}) {
    try {
        return await originalMakeRequest(endpoint, options);
    } catch (error) {
        // Only handle 401 errors and token refresh
        if (error.message.includes('Session expired') && !isRefreshing) {
            isRefreshing = true;

            return new Promise((resolve, reject) => {
                failedQueue.push({ resolve, reject });

                ApiService.refreshToken()
                    .then(({ token }) => {
                        // Store new token
                        localStorage.setItem('psn_welfare_token', token);

                        // Retry failed requests
                        processQueue(null, token);
                        resolve(originalMakeRequest(endpoint, options));
                    })
                    .catch(refreshError => {
                        processQueue(refreshError, null);
                        reject(refreshError);
                    })
                    .finally(() => {
                        isRefreshing = false;
                    });
            });
        }

        throw error;
    }
};

// Make ApiService available globally
window.ApiService = ApiService;
window.getAuthHeaders = getAuthHeaders;
window.handleResponse = handleResponse;

// Export for Node.js/CommonJS
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ApiService,
        getAuthHeaders,
        handleResponse,
        makeRequest
    };
}

// Log API configuration in development
if (CONFIG.ENV === 'development') {
    console.log('🔌 API Configuration:', {
        baseUrl: API_BASE_URL,
        environment: CONFIG.ENV
    });
}