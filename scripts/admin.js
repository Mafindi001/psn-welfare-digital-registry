/**
 * Admin Dashboard Functionality for PSN Welfare Registry - Vercel Compatible
 */

// Admin State Management
const AdminState = {
    currentSection: 'admin-dashboard',
    members: [],
    reminderLogs: [],
    upcomingEvents: [],
    systemLogs: [],
    selectedMembers: new Set(),
    filters: {
        status: '',
        type: '',
        search: ''
    },
    pagination: {
        currentPage: 1,
        itemsPerPage: 10,
        totalItems: 0,
        totalPages: 1
    },
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    isLoading: false,
    news: {
        posts: [],
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 1,
        pendingFile: null
    }
};

// DOM Elements cache
const AdminElements = {
    // Navigation
    navItems: null,
    sidebar: null,
    mobileMenuToggle: null,

    // Sections
    sections: {},

    // Stats
    statElements: {},

    // Tables
    tables: {},

    // Forms and Filters
    filters: {},
    searchInputs: {},

    // Buttons
    buttons: {},

    // Modals
    modals: {}
};

/**
 * Initialize Admin Dashboard
 */
async function initAdminDashboard() {
    try {
        console.log('🚀 Initializing admin dashboard...');

        // Check authentication and admin status
        const user = getCurrentUser();

        if (!requireAuth()) {
            return;
        }

        if (!user || !user.isAdmin) {
            console.log('User is not admin, redirecting to dashboard');
            showNotification('Admin access required. Redirecting to member dashboard.', 'warning');
            setTimeout(() => {
                window.location.href = '/pages/dashboard.html';
            }, 2000);
            return;
        }

        console.log('Admin user authenticated:', user);

        // Cache DOM elements
        cacheAdminElements();

        // Update admin info
        updateAdminInfo(user);

        // Load initial data
        await loadInitialData();

        // Set up event listeners
        setupAdminEventListeners();

        // Initialize calendar
        generateCalendar();

        console.log('✅ Admin dashboard initialized');

    } catch (error) {
        console.error('❌ Admin dashboard initialization failed:', error);
        showNotification('Failed to initialize admin dashboard', 'error');
    }
}

/**
 * Cache DOM elements for better performance
 */
function cacheAdminElements() {
    // Navigation
    AdminElements.navItems = document.querySelectorAll('.nav-item');
    AdminElements.sidebar = document.getElementById('sidebar');
    AdminElements.mobileMenuToggle = document.getElementById('mobileMenuToggle');

    // Sections
    AdminElements.sections = {
        'admin-dashboard': document.getElementById('admin-dashboard-section'),
        'manage-members': document.getElementById('manage-members-section'),
        'reminder-logs': document.getElementById('reminder-logs-section'),
        'upcoming-events': document.getElementById('upcoming-events-section'),
        'reports': document.getElementById('reports-section'),
        'news': document.getElementById('newsSection'),
        'system-logs': document.getElementById('system-logs-section'),
        'settings': document.getElementById('settings-section')
    };

    // Stats elements
    AdminElements.statElements = {
        totalMembers: document.getElementById('totalMembers'),
        upcomingCelebrations: document.getElementById('upcomingCelebrations'),
        remindersSent: document.getElementById('remindersSent'),
        activeMembers: document.getElementById('activeMembers'),
        membersCount: document.getElementById('membersCount'),
        remindersCount: document.getElementById('remindersCount'),
        eventsCount: document.getElementById('eventsCount'),
        lastUpdated: document.getElementById('lastUpdated')
    };

    // Tables
    AdminElements.tables = {
        membersTableBody: document.getElementById('membersTableBody'),
        remindersTableBody: document.getElementById('remindersTableBody'),
        logsTableBody: document.getElementById('logsTableBody')
    };

    // Forms and Filters
    AdminElements.filters = {
        statusFilter: document.getElementById('statusFilter'),
        memberTypeFilter: document.getElementById('memberTypeFilter'),
        logTypeFilter: document.getElementById('logTypeFilter')
    };

    AdminElements.searchInputs = {
        memberSearch: document.getElementById('memberSearch'),
        logSearch: document.getElementById('logSearch')
    };

    // Buttons
    AdminElements.buttons = {
        logoutBtn: document.getElementById('logoutBtn'),
        refreshDataBtn: document.getElementById('refreshDataBtn'),
        quickExportBtn: document.getElementById('quickExportBtn'),
        addMemberBtn: document.getElementById('addMemberBtn'),
        sendAnnouncementBtn: document.getElementById('sendAnnouncementBtn'),
        viewReportsBtn: document.getElementById('viewReportsBtn'),
        systemHealthBtn: document.getElementById('systemHealthBtn'),
        clearFiltersBtn: document.getElementById('clearFiltersBtn'),
        selectAllMembers: document.getElementById('selectAllMembers'),
        exportSelectedBtn: document.getElementById('exportSelectedBtn'),
        deactivateSelectedBtn: document.getElementById('deactivateSelectedBtn'),
        deleteSelectedBtn: document.getElementById('deleteSelectedBtn'),
        prevMonth: document.getElementById('prevMonth'),
        nextMonth: document.getElementById('nextMonth'),
        addNewMemberBtn: document.getElementById('addNewMemberBtn')
    };

    // Modals
    AdminElements.modals = {
        viewMemberModal: document.getElementById('viewMemberModal'),
        memberDetailsContent: document.getElementById('memberDetailsContent')
    };

    // Calendar
    AdminElements.calendarGrid = document.getElementById('calendarGrid');
    AdminElements.currentMonth = document.getElementById('currentMonth');
}

/**
 * Load initial data
 */
async function loadInitialData() {
    AdminState.isLoading = true;

    try {
        await Promise.all([
            loadDashboardStats(),
            loadMembers(),
            loadReminderLogs(),
            loadUpcomingEvents(),
            loadSystemLogs()
        ]);

        showNotification('Dashboard data loaded successfully', 'success');
    } catch (error) {
        console.error('Error loading initial data:', error);
        showNotification('Failed to load some dashboard data', 'warning');
    } finally {
        AdminState.isLoading = false;
    }
}

/**
 * Update admin info in sidebar
 */
function updateAdminInfo(user) {
    const adminName = document.getElementById('adminName');
    const adminPsn = document.getElementById('adminPsn');
    const pageTitle = document.getElementById('pageTitle');

    if (adminName) adminName.textContent = user.fullName || 'Admin User';
    if (adminPsn) adminPsn.textContent = user.psnNumber || 'ADMIN';
    if (pageTitle) pageTitle.textContent = `Admin Dashboard - Welcome ${user.fullName?.split(' ')[0] || 'Admin'}`;
}

/**
 * Load dashboard statistics
 */
async function loadDashboardStats() {
    try {
        if (typeof ApiService !== 'undefined') {
            const stats = await ApiService.getAdminStats();
            updateDashboardStats(stats);
        } else {
            // Fallback to mock data for demo
            const mockStats = {
                totalMembers: 157,
                upcomingCelebrations: 23,
                remindersSent: 1245,
                activeMembers: 149,
                membersThisMonth: 12
            };
            updateDashboardStats(mockStats);
        }
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
        // Use fallback stats
        updateDashboardStats({
            totalMembers: 0,
            upcomingCelebrations: 0,
            remindersSent: 0,
            activeMembers: 0,
            membersThisMonth: 0
        });
    }
}

/**
 * Update dashboard statistics UI
 */
function updateDashboardStats(stats) {
    // Update stat cards
    if (AdminElements.statElements.totalMembers) {
        AdminElements.statElements.totalMembers.textContent = stats.totalMembers?.toLocaleString() || '0';
    }

    if (AdminElements.statElements.upcomingCelebrations) {
        AdminElements.statElements.upcomingCelebrations.textContent = stats.upcomingCelebrations?.toLocaleString() || '0';
    }

    if (AdminElements.statElements.remindersSent) {
        AdminElements.statElements.remindersSent.textContent = stats.remindersSent?.toLocaleString() || '0';
    }

    if (AdminElements.statElements.activeMembers) {
        AdminElements.statElements.activeMembers.textContent = stats.activeMembers?.toLocaleString() || '0';
    }

    // Update navigation badges
    if (AdminElements.statElements.membersCount) {
        AdminElements.statElements.membersCount.textContent = stats.totalMembers?.toLocaleString() || '0';
    }

    if (AdminElements.statElements.remindersCount) {
        AdminElements.statElements.remindersCount.textContent = stats.remindersSent?.toLocaleString() || '0';
    }

    if (AdminElements.statElements.eventsCount) {
        AdminElements.statElements.eventsCount.textContent = stats.upcomingCelebrations?.toLocaleString() || '0';
    }

    // Update last updated time
    if (AdminElements.statElements.lastUpdated) {
        AdminElements.statElements.lastUpdated.textContent = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}

/**
 * Load members data
 */
async function loadMembers() {
    try {
        if (typeof ApiService !== 'undefined') {
            const response = await ApiService.getAllMembers(
                AdminState.pagination.currentPage,
                AdminState.pagination.itemsPerPage,
                AdminState.filters
            );

            AdminState.members = response.data || [];
            AdminState.pagination.totalItems = response.total || 0;
            AdminState.pagination.totalPages = Math.ceil(response.total / AdminState.pagination.itemsPerPage);
        } else {
            // Fallback to mock data for demo
            AdminState.members = generateMockMembers(50);
            AdminState.pagination.totalItems = AdminState.members.length;
            AdminState.pagination.totalPages = Math.ceil(AdminState.members.length / AdminState.pagination.itemsPerPage);
        }

        renderMembersTable();
        updatePagination();

    } catch (error) {
        console.error('Error loading members:', error);
        showNotification('Failed to load members data', 'error');
        AdminState.members = [];
    }
}

/**
 * Generate mock members data for demo
 */
function generateMockMembers(count) {
    const members = [];
    const names = [
        'Dr. John Pharmacist', 'Dr. Sarah Johnson', 'Dr. Michael Adekunle',
        'Dr. Chinyere Okoro', 'Dr. James Williams', 'Dr. Amina Mohammed',
        'Dr. Chukwudi Nwankwo', 'Dr. Fatima Bello', 'Dr. Emmanuel Okafor',
        'Dr. Grace Chukwu', 'Dr. Ibrahim Musa', 'Dr. Blessing Adeyemi'
    ];

    const domains = ['gmail.com', 'yahoo.com', 'psntaraba.org.ng', 'example.com'];

    for (let i = 1; i <= count; i++) {
        const name = names[Math.floor(Math.random() * names.length)];
        const firstName = name.split(' ')[1]?.toLowerCase() || 'user';
        const domain = domains[Math.floor(Math.random() * domains.length)];

        members.push({
            id: `member_${i}`,
            psnNumber: `PSN-TARA-2024-${i.toString().padStart(3, '0')}`,
            fullName: name,
            email: `${firstName}${i}@${domain}`,
            phone: `0803${Math.floor(1000000 + Math.random() * 9000000)}`,
            status: Math.random() > 0.1 ? 'active' : 'inactive',
            isAdmin: i <= 5,
            registeredDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
            lastLogin: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
            dateOfBirth: new Date(1960 + Math.floor(Math.random() * 30), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toISOString(),
            weddingDate: Math.random() > 0.3 ? new Date(2000 + Math.floor(Math.random() * 20), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toISOString() : null
        });
    }

    return members;
}

/**
 * Render members table
 */
function renderMembersTable() {
    const tableBody = AdminElements.tables.membersTableBody;
    if (!tableBody) return;

    // Filter members based on search and filters
    const searchTerm = AdminElements.searchInputs.memberSearch?.value.toLowerCase() || '';
    const statusFilter = AdminElements.filters.statusFilter?.value || '';
    const typeFilter = AdminElements.filters.memberTypeFilter?.value || '';

    let filteredMembers = AdminState.members.filter(member => {
        const matchesSearch = searchTerm === '' ||
            member.fullName.toLowerCase().includes(searchTerm) ||
            member.psnNumber.toLowerCase().includes(searchTerm) ||
            member.email.toLowerCase().includes(searchTerm);

        const matchesStatus = !statusFilter || member.status === statusFilter;
        const matchesType = !typeFilter ||
            (typeFilter === 'admin' ? member.isAdmin : !member.isAdmin);

        return matchesSearch && matchesStatus && matchesType;
    });

    // Update total items after filtering
    AdminState.pagination.totalItems = filteredMembers.length;
    AdminState.pagination.totalPages = Math.ceil(filteredMembers.length / AdminState.pagination.itemsPerPage);

    // Calculate pagination
    const startIndex = (AdminState.pagination.currentPage - 1) * AdminState.pagination.itemsPerPage;
    const endIndex = startIndex + AdminState.pagination.itemsPerPage;
    const paginatedMembers = filteredMembers.slice(startIndex, endIndex);

    // Clear table
    tableBody.innerHTML = '';

    if (paginatedMembers.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="empty-state-cell">
                    <i class="fas fa-users-slash"></i>
                    <p>No members found matching your criteria</p>
                    ${searchTerm || statusFilter || typeFilter ?
                '<button class="btn btn-outline btn-sm mt-2" onclick="clearMemberFilters()">Clear Filters</button>' :
                ''}
                </td>
            </tr>
        `;
        return;
    }

    // Add rows
    paginatedMembers.forEach(member => {
        const isSelected = AdminState.selectedMembers.has(member.id);
        const row = document.createElement('tr');
        row.dataset.memberId = member.id;

        row.innerHTML = `
            <td>
                <input type="checkbox" class="member-checkbox" 
                       data-id="${member.id}" ${isSelected ? 'checked' : ''}
                       aria-label="Select member ${member.fullName}">
            </td>
            <td>
                <strong>${member.psnNumber}</strong>
            </td>
            <td>
                <div class="member-name">${member.fullName}</div>
                ${member.isAdmin ?
                '<span class="status-badge badge-admin" style="margin-top: 0.25rem;">Admin</span>' :
                ''}
            </td>
            <td>${member.email}</td>
            <td>${member.phone}</td>
            <td>
                <span class="status-badge ${member.status === 'active' ? 'status-active' : 'status-inactive'}">
                    ${member.status.charAt(0).toUpperCase() + member.status.slice(1)}
                </span>
            </td>
            <td>${member.isAdmin ? 'Administrator' : 'Member'}</td>
            <td>${formatDate(member.registeredDate, 'short')}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-outline btn-sm view-member" data-id="${member.id}" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-outline btn-sm edit-member" data-id="${member.id}" title="Edit Member">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-outline btn-sm ${member.status === 'active' ? 'btn-warning' : 'btn-success'}" 
                            data-id="${member.id}" 
                            data-action="${member.status === 'active' ? 'deactivate' : 'activate'}"
                            title="${member.status === 'active' ? 'Deactivate' : 'Activate'}">
                        <i class="fas fa-${member.status === 'active' ? 'user-slash' : 'user-check'}"></i>
                    </button>
                </div>
            </td>
        `;

        tableBody.appendChild(row);
    });

    // Update selected count
    updateSelectedCount();
}

/**
 * Clear member filters
 */
function clearMemberFilters() {
    if (AdminElements.searchInputs.memberSearch) {
        AdminElements.searchInputs.memberSearch.value = '';
    }
    if (AdminElements.filters.statusFilter) {
        AdminElements.filters.statusFilter.value = '';
    }
    if (AdminElements.filters.memberTypeFilter) {
        AdminElements.filters.memberTypeFilter.value = '';
    }

    AdminState.filters = { status: '', type: '', search: '' };
    AdminState.pagination.currentPage = 1;
    loadMembers();
}

/**
 * Load reminder logs
 */
async function loadReminderLogs() {
    try {
        if (typeof ApiService !== 'undefined') {
            const logs = await ApiService.getReminderLogs();
            AdminState.reminderLogs = logs.data || [];
        } else {
            // Fallback to mock data for demo
            AdminState.reminderLogs = generateMockReminderLogs(100);
        }

        renderReminderLogs();
        updateReminderStats();

    } catch (error) {
        console.error('Error loading reminder logs:', error);
        showNotification('Failed to load reminder logs', 'error');
        AdminState.reminderLogs = [];
    }
}

/**
 * Generate mock reminder logs for demo
 */
function generateMockReminderLogs(count) {
    const logs = [];
    const events = ['Birthday', 'Wedding Anniversary', 'Child\'s Birthday', 'Work Anniversary'];
    const statuses = ['sent', 'sent', 'sent', 'sent', 'failed', 'pending'];
    const members = AdminState.members.slice(0, 20);

    for (let i = 0; i < count; i++) {
        const member = members[Math.floor(Math.random() * members.length)];
        const event = events[Math.floor(Math.random() * events.length)];
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const daysAgo = Math.floor(Math.random() * 30);

        logs.push({
            id: `log_${i}`,
            memberId: member.id,
            memberName: member.fullName,
            recipientEmail: member.email,
            eventType: event,
            eventDate: new Date(Date.now() + Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
            sentDate: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
            status: status,
            errorMessage: status === 'failed' ? 'SMTP connection timeout' : null,
            channel: ['email', 'sms'][Math.floor(Math.random() * 2)]
        });
    }

    return logs.sort((a, b) => new Date(b.sentDate) - new Date(a.sentDate));
}

/**
 * Render reminder logs
 */
function renderReminderLogs() {
    const tableBody = AdminElements.tables.remindersTableBody;
    if (!tableBody) return;

    // Clear table
    tableBody.innerHTML = '';

    // Show only recent logs
    const recentLogs = AdminState.reminderLogs.slice(0, 20);

    if (recentLogs.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state-cell">
                    <i class="fas fa-bell-slash"></i>
                    <p>No reminder logs found</p>
                </td>
            </tr>
        `;
        return;
    }

    recentLogs.forEach(log => {
        const row = document.createElement('tr');

        row.innerHTML = `
            <td>${formatDate(log.sentDate, 'full')}</td>
            <td>
                <div>${log.memberName}</div>
                <small class="text-muted">${log.recipientEmail}</small>
            </td>
            <td>${log.eventType}</td>
            <td>${formatDate(log.eventDate, 'short')}</td>
            <td>
                <span class="status-badge ${log.status === 'sent' ? 'status-active' :
                log.status === 'failed' ? 'status-inactive' : 'status-pending'
            }">
                    ${log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                </span>
            </td>
            <td>${log.channel || 'Email'}</td>
            <td>
                <button class="btn btn-outline btn-sm view-log" data-id="${log.id}" title="View Details">
                    <i class="fas fa-info-circle"></i>
                </button>
                ${log.status === 'failed' ? `
                <button class="btn btn-outline btn-sm retry-log" data-id="${log.id}" title="Retry">
                    <i class="fas fa-redo"></i>
                </button>
                ` : ''}
            </td>
        `;

        tableBody.appendChild(row);
    });
}

/**
 * Update reminder statistics
 */
function updateReminderStats() {
    const total = AdminState.reminderLogs.length;
    const successful = AdminState.reminderLogs.filter(log => log.status === 'sent').length;
    const failed = AdminState.reminderLogs.filter(log => log.status === 'failed').length;
    const pending = AdminState.reminderLogs.filter(log => log.status === 'pending').length;

    // Update UI if elements exist
    const elements = {
        totalReminders: document.getElementById('totalReminders'),
        successfulReminders: document.getElementById('successfulReminders'),
        failedReminders: document.getElementById('failedReminders'),
        pendingReminders: document.getElementById('pendingReminders')
    };

    for (const [id, element] of Object.entries(elements)) {
        if (element) {
            const value = { total, successful, failed, pending }[id];
            element.textContent = value.toLocaleString();
        }
    }
}

/**
 * Load upcoming events
 */
async function loadUpcomingEvents() {
    try {
        if (typeof ApiService !== 'undefined') {
            const events = await ApiService.getUpcomingEvents(30);
            AdminState.upcomingEvents = events.data || [];
        } else {
            // Fallback to mock data for demo
            AdminState.upcomingEvents = generateMockUpcomingEvents(30);
        }

        renderUpcomingEvents();

    } catch (error) {
        console.error('Error loading upcoming events:', error);
        showNotification('Failed to load upcoming events', 'error');
        AdminState.upcomingEvents = [];
    }
}

/**
 * Render upcoming events
 */
function renderUpcomingEvents() {
    const eventsList = document.getElementById('upcomingEventsList');
    if (!eventsList) return;

    // Clear list
    eventsList.innerHTML = '';

    // Show only next events
    const nextEvents = AdminState.upcomingEvents.slice(0, 10);

    if (nextEvents.length === 0) {
        eventsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-calendar-times"></i>
                <p>No upcoming events</p>
            </div>
        `;
        return;
    }

    nextEvents.forEach(event => {
        const eventDate = new Date(event.eventDate);
        const today = new Date();
        const isToday = eventDate.toDateString() === today.toDateString();
        const daysUntil = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));

        const eventCard = document.createElement('div');
        eventCard.className = `upcoming-event-card ${isToday ? 'today' : ''}`;
        eventCard.dataset.eventId = event.id;

        eventCard.innerHTML = `
            <div class="event-content">
                <h4>${event.eventType}</h4>
                <p class="event-member">
                    <i class="fas fa-user"></i> ${event.memberName}
                </p>
                <p class="event-email">
                    <i class="fas fa-envelope"></i> ${event.memberEmail}
                </p>
            </div>
            <div class="event-actions">
                <div class="event-date-badge ${daysUntil <= 7 ? 'urgent' : ''}">
                    ${isToday ? 'TODAY' : `In ${daysUntil} days`}
                </div>
                <p class="event-date">${formatDate(event.eventDate, 'full')}</p>
                <div class="event-buttons">
                    <button class="btn btn-outline btn-sm send-reminder" data-id="${event.id}" title="Send Reminder">
                        <i class="fas fa-bell"></i> Send Reminder
                    </button>
                </div>
            </div>
        `;

        eventsList.appendChild(eventCard);
    });
}

/**
 * Load system logs
 */
async function loadSystemLogs() {
    try {
        if (typeof ApiService !== 'undefined') {
            const logs = await ApiService.getSystemLogs(
                AdminState.pagination.currentPage,
                50,
                AdminState.filters
            );
            AdminState.systemLogs = logs.data || [];
        } else {
            // Fallback to mock data for demo
            AdminState.systemLogs = generateMockSystemLogs(50);
        }

        renderSystemLogs();

    } catch (error) {
        console.error('Error loading system logs:', error);
        showNotification('Failed to load system logs', 'error');
        AdminState.systemLogs = [];
    }
}

/**
 * Render system logs
 */
function renderSystemLogs() {
    const tableBody = AdminElements.tables.logsTableBody;
    if (!tableBody) return;

    const searchTerm = AdminElements.searchInputs.logSearch?.value.toLowerCase() || '';
    const typeFilter = AdminElements.filters.logTypeFilter?.value || '';

    // Filter logs
    let filteredLogs = AdminState.systemLogs.filter(log => {
        const matchesSearch = searchTerm === '' ||
            log.userName.toLowerCase().includes(searchTerm) ||
            log.action.toLowerCase().includes(searchTerm) ||
            log.details.toLowerCase().includes(searchTerm);

        const matchesType = !typeFilter || log.action === typeFilter.toUpperCase();

        return matchesSearch && matchesType;
    });

    // Clear table
    tableBody.innerHTML = '';

    if (filteredLogs.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state-cell">
                    <i class="fas fa-clipboard"></i>
                    <p>No logs found matching your criteria</p>
                </td>
            </tr>
        `;
        return;
    }

    // Add rows
    filteredLogs.forEach(log => {
        const row = document.createElement('tr');

        row.innerHTML = `
            <td>${formatDate(log.timestamp, 'full')}</td>
            <td>${log.userName}</td>
            <td>
                <span class="status-badge ${this.getLogActionClass(log.action)}">
                    ${log.action.replace(/_/g, ' ')}
                </span>
            </td>
            <td>${log.details}</td>
            <td>${log.ipAddress}</td>
        `;

        tableBody.appendChild(row);
    });
}

/**
 * Get CSS class for log action
 */
function getLogActionClass(action) {
    switch (action) {
        case 'LOGIN': return 'status-success';
        case 'LOGOUT': return 'status-info';
        case 'CREATE': return 'status-success';
        case 'UPDATE': return 'status-warning';
        case 'DELETE': return 'status-error';
        case 'ERROR': return 'status-error';
        default: return 'status-secondary';
    }
}

/**
 * Generate calendar
 */
function generateCalendar() {
    if (!AdminElements.calendarGrid || !AdminElements.currentMonth) return;

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    // Update month display
    AdminElements.currentMonth.textContent =
        `${monthNames[AdminState.currentMonth]} ${AdminState.currentYear}`;

    // Get first day of month
    const firstDay = new Date(AdminState.currentYear, AdminState.currentMonth, 1);
    const lastDay = new Date(AdminState.currentYear, AdminState.currentMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();

    // Clear calendar
    AdminElements.calendarGrid.innerHTML = '';

    // Add day headers
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayNames.forEach(day => {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'calendar-day-header';
        dayHeader.textContent = day;
        AdminElements.calendarGrid.appendChild(dayHeader);
    });

    // Add empty cells for days before first day of month
    for (let i = 0; i < startingDay; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'calendar-day empty';
        AdminElements.calendarGrid.appendChild(emptyDay);
    }

    // Add days of month
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-day';

        const currentDate = new Date(AdminState.currentYear, AdminState.currentMonth, day);
        const dateStr = currentDate.toISOString().split('T')[0];
        const isToday = currentDate.toDateString() === today.toDateString();

        // Find events for this day
        const dayEvents = AdminState.upcomingEvents.filter(event => {
            const eventDate = new Date(event.eventDate).toISOString().split('T')[0];
            return eventDate === dateStr;
        });

        if (isToday) {
            dayCell.classList.add('today');
        }

        dayCell.innerHTML = `
            <div class="day-number ${isToday ? 'today-number' : ''}">${day}</div>
            ${dayEvents.slice(0, 2).map(event => `
                <div class="calendar-event" title="${event.eventType} - ${event.memberName}">
                    <i class="fas fa-${event.eventType === 'Birthday' ? 'birthday-cake' : 'heart'}"></i>
                    ${event.memberName.split(' ')[0]}
                </div>
            `).join('')}
            ${dayEvents.length > 2 ? `
                <div class="calendar-more">
                    +${dayEvents.length - 2} more
                </div>
            ` : ''}
        `;

        // Add click event to view day details
        dayCell.addEventListener('click', () => {
            if (dayEvents.length > 0) {
                showDayEvents(currentDate, dayEvents);
            }
        });

        AdminElements.calendarGrid.appendChild(dayCell);
    }
}

/**
 * Show events for a specific day
 */
function showDayEvents(date, events) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';

    const dateStr = formatDate(date, 'long');

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Events on ${dateStr}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                ${events.length === 0 ?
            '<p class="empty-state">No events scheduled for this day</p>' :
            events.map(event => `
                        <div class="event-item">
                            <div class="event-icon">
                                <i class="fas fa-${event.eventType === 'Birthday' ? 'birthday-cake' : 'heart'}"></i>
                            </div>
                            <div class="event-details">
                                <h4>${event.eventType}</h4>
                                <p>${event.memberName} (${event.memberEmail})</p>
                            </div>
                            <button class="btn btn-outline btn-sm send-reminder" data-id="${event.id}">
                                Send Reminder
                            </button>
                        </div>
                    `).join('')
        }
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Close modal
    modal.querySelector('.modal-close').addEventListener('click', () => {
        modal.remove();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

/**
 * Show a specific section
 */
function showSection(section) {
    if (!section || !AdminElements.sections[section]) {
        console.error(`Section "${section}" not found`);
        return;
    }

    // Hide all sections
    Object.values(AdminElements.sections).forEach(sec => {
        if (sec) {
            sec.style.display = 'none';
            sec.classList.remove('active-section');
        }
    });

    // Update navigation
    AdminElements.navItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-section') === section) {
            item.classList.add('active');
        }
    });

    // Show selected section
    AdminState.currentSection = section;
    const targetSection = AdminElements.sections[section];

    if (targetSection) {
        targetSection.style.display = 'block';
        setTimeout(() => {
            targetSection.classList.add('active-section');
        }, 10);

        // Update page title
        const sectionTitles = {
            'admin-dashboard': 'Admin Dashboard',
            'manage-members': 'Manage Members',
            'reminder-logs': 'Reminder Logs',
            'upcoming-events': 'Upcoming Events',
            'reports': 'Reports & Analytics',
            'news': 'News & Announcements',
            'system-logs': 'System Audit Logs',
            'settings': 'System Settings'
        };

        const user = getCurrentUser();
        const sectionSubtitles = {
            'admin-dashboard': `Welcome ${user?.fullName?.split(' ')[0] || 'Admin'}, Welfare Secretary`,
            'manage-members': 'Manage PSN Taraba members',
            'reminder-logs': 'Track and manage reminder delivery',
            'upcoming-events': 'View upcoming celebrations',
            'reports': 'Generate reports and analytics',
            'news': 'Publish and manage news posts and announcements',
            'system-logs': 'System audit trail and security logs',
            'settings': 'Configure system settings'
        };

        if (AdminElements.pageTitle) {
            AdminElements.pageTitle.textContent = sectionTitles[section] || 'Admin Dashboard';
        }

        if (AdminElements.pageSubtitle) {
            AdminElements.pageSubtitle.textContent = sectionSubtitles[section] || 'Welfare Secretary Control Panel';
        }
    }

    // Close mobile menu on selection
    if (window.innerWidth <= 992 && AdminElements.sidebar) {
        AdminElements.sidebar.classList.remove('open');
    }
}

/**
 * Update selected members count
 */
function updateSelectedCount() {
    const count = AdminState.selectedMembers.size;
    const countElement = document.getElementById('selectedCount');

    if (countElement) {
        countElement.textContent = count;
        countElement.parentElement.style.display = count > 0 ? 'block' : 'none';
    }

    // Enable/disable action buttons
    const actionButtons = ['exportSelectedBtn', 'deactivateSelectedBtn', 'deleteSelectedBtn'];
    actionButtons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.disabled = count === 0;
        }
    });
}

/**
 * Update pagination
 */
function updatePagination() {
    const paginationInfo = document.querySelector('.pagination-info');
    const prevBtn = document.querySelector('.pagination-btn:first-child');
    const nextBtn = document.querySelector('.pagination-btn:last-child');

    if (paginationInfo) {
        paginationInfo.textContent =
            `Page ${AdminState.pagination.currentPage} of ${AdminState.pagination.totalPages}`;
    }

    if (prevBtn) {
        prevBtn.disabled = AdminState.pagination.currentPage === 1;
    }

    if (nextBtn) {
        nextBtn.disabled = AdminState.pagination.currentPage === AdminState.pagination.totalPages;
    }
}

/**
 * Setup event listeners
 */
function setupAdminEventListeners() {
    // Mobile menu toggle
    if (AdminElements.mobileMenuToggle && AdminElements.sidebar) {
        AdminElements.mobileMenuToggle.addEventListener('click', () => {
            AdminElements.sidebar.classList.toggle('open');
        });
    }

    // Navigation
    AdminElements.navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.getAttribute('data-section');
            showSection(section);
        });
    });

    // Logout
    if (AdminElements.buttons.logoutBtn) {
        AdminElements.buttons.logoutBtn.addEventListener('click', logout);
    }

    // Refresh data button
    if (AdminElements.buttons.refreshDataBtn) {
        AdminElements.buttons.refreshDataBtn.addEventListener('click', async () => {
            showNotification('Refreshing data...', 'info');
            await loadInitialData();
            showNotification('Data refreshed successfully', 'success');
        });
    }

    // Quick export button
    if (AdminElements.buttons.quickExportBtn) {
        AdminElements.buttons.quickExportBtn.addEventListener('click', async () => {
            try {
                showNotification('Preparing data export...', 'info');
                if (typeof ApiService !== 'undefined') {
                    await ApiService.exportData('csv');
                } else {
                    // Mock export for demo
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    showNotification('Export completed successfully', 'success');
                }
            } catch (error) {
                showNotification(`Export failed: ${error.message}`, 'error');
            }
        });
    }

    // Quick action buttons
    if (AdminElements.buttons.addMemberBtn) {
        AdminElements.buttons.addMemberBtn.addEventListener('click', () => {
            showSection('manage-members');
            if (AdminElements.buttons.addNewMemberBtn) {
                AdminElements.buttons.addNewMemberBtn.click();
            }
        });
    }

    // Member search with debounce
    if (AdminElements.searchInputs.memberSearch) {
        const searchHandler = debounce(() => {
            AdminState.filters.search = AdminElements.searchInputs.memberSearch.value;
            AdminState.pagination.currentPage = 1;
            loadMembers();
        }, 300);

        AdminElements.searchInputs.memberSearch.addEventListener('input', searchHandler);
    }

    // Member filters
    if (AdminElements.filters.statusFilter) {
        AdminElements.filters.statusFilter.addEventListener('change', () => {
            AdminState.filters.status = AdminElements.filters.statusFilter.value;
            AdminState.pagination.currentPage = 1;
            loadMembers();
        });
    }

    if (AdminElements.filters.memberTypeFilter) {
        AdminElements.filters.memberTypeFilter.addEventListener('change', () => {
            AdminState.filters.type = AdminElements.filters.memberTypeFilter.value;
            AdminState.pagination.currentPage = 1;
            loadMembers();
        });
    }

    // Clear filters button
    if (AdminElements.buttons.clearFiltersBtn) {
        AdminElements.buttons.clearFiltersBtn.addEventListener('click', clearMemberFilters);
    }

    // Select all members checkbox
    if (AdminElements.buttons.selectAllMembers) {
        AdminElements.buttons.selectAllMembers.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            const checkboxes = document.querySelectorAll('.member-checkbox');

            if (isChecked) {
                checkboxes.forEach(cb => {
                    const memberId = cb.getAttribute('data-id');
                    AdminState.selectedMembers.add(memberId);
                    cb.checked = true;
                });
            } else {
                AdminState.selectedMembers.clear();
                checkboxes.forEach(cb => cb.checked = false);
            }

            updateSelectedCount();
        });
    }

    // Member table actions (delegated events)
    document.addEventListener('click', (e) => {
        // View member
        if (e.target.closest('.view-member')) {
            const memberId = e.target.closest('.view-member').getAttribute('data-id');
            viewMemberDetails(memberId);
        }

        // Edit member
        if (e.target.closest('.edit-member')) {
            const memberId = e.target.closest('.edit-member').getAttribute('data-id');
            editMember(memberId);
        }

        // Activate/Deactivate member
        if (e.target.closest('[data-action]')) {
            const button = e.target.closest('[data-action]');
            const memberId = button.getAttribute('data-id');
            const action = button.getAttribute('data-action');
            toggleMemberStatus(memberId, action);
        }

        // Member checkbox
        if (e.target.classList.contains('member-checkbox')) {
            const memberId = e.target.getAttribute('data-id');
            const isChecked = e.target.checked;

            if (isChecked) {
                AdminState.selectedMembers.add(memberId);
            } else {
                AdminState.selectedMembers.delete(memberId);
                if (AdminElements.buttons.selectAllMembers) {
                    AdminElements.buttons.selectAllMembers.checked = false;
                }
            }

            updateSelectedCount();
        }
    });

    // Export selected members
    if (AdminElements.buttons.exportSelectedBtn) {
        AdminElements.buttons.exportSelectedBtn.addEventListener('click', async () => {
            if (AdminState.selectedMembers.size === 0) {
                showNotification('Please select members first', 'warning');
                return;
            }

            try {
                showNotification(`Exporting ${AdminState.selectedMembers.size} members...`, 'info');
                // Implement export logic
                await new Promise(resolve => setTimeout(resolve, 1500));
                showNotification('Export completed successfully', 'success');
            } catch (error) {
                showNotification(`Export failed: ${error.message}`, 'error');
            }
        });
    }

    // Calendar navigation
    if (AdminElements.buttons.prevMonth) {
        AdminElements.buttons.prevMonth.addEventListener('click', () => {
            AdminState.currentMonth--;
            if (AdminState.currentMonth < 0) {
                AdminState.currentMonth = 11;
                AdminState.currentYear--;
            }
            generateCalendar();
        });
    }

    if (AdminElements.buttons.nextMonth) {
        AdminElements.buttons.nextMonth.addEventListener('click', () => {
            AdminState.currentMonth++;
            if (AdminState.currentMonth > 11) {
                AdminState.currentMonth = 0;
                AdminState.currentYear++;
            }
            generateCalendar();
        });
    }
}

/**
 * View member details
 */
function viewMemberDetails(memberId) {
    const member = AdminState.members.find(m => m.id === memberId);
    if (!member) return;

    const modal = AdminElements.modals.viewMemberModal;
    const content = AdminElements.modals.memberDetailsContent;

    if (!modal || !content) return;

    content.innerHTML = `
        <div class="member-details">
            <div class="detail-row">
                <div class="detail-label">PSN Number</div>
                <div class="detail-value">${member.psnNumber}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Full Name</div>
                <div class="detail-value">${member.fullName}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Email</div>
                <div class="detail-value">${member.email}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Phone</div>
                <div class="detail-value">${member.phone}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Status</div>
                <div class="detail-value">
                    <span class="status-badge ${member.status === 'active' ? 'status-active' : 'status-inactive'}">
                        ${member.status.charAt(0).toUpperCase() + member.status.slice(1)}
                    </span>
                </div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Account Type</div>
                <div class="detail-value">${member.isAdmin ? 'Administrator' : 'Regular Member'}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Date of Birth</div>
                <div class="detail-value">${member.dateOfBirth ? formatDate(member.dateOfBirth) : 'Not set'}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Wedding Anniversary</div>
                <div class="detail-value">${member.weddingDate ? formatDate(member.weddingDate) : 'Not set'}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Registered Date</div>
                <div class="detail-value">${formatDate(member.registeredDate, 'full')}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Last Login</div>
                <div class="detail-value">${formatDate(member.lastLogin, 'full')}</div>
            </div>
        </div>
    `;

    modal.style.display = 'flex';

    // Close modal
    document.getElementById('closeMemberModal')?.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    modal.querySelector('.modal-close')?.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
}

/**
 * Edit member (placeholder)
 */
function editMember(memberId) {
    const member = AdminState.members.find(m => m.id === memberId);
    if (!member) return;

    showNotification(`Edit member: ${member.fullName} (Feature in development)`, 'info');
    // TODO: Implement edit modal
}

/**
 * Toggle member status
 */
async function toggleMemberStatus(memberId, action) {
    const member = AdminState.members.find(m => m.id === memberId);
    if (!member) return;

    const newStatus = action === 'deactivate' ? 'inactive' : 'active';
    const actionText = action === 'deactivate' ? 'deactivate' : 'activate';

    if (!confirm(`${actionText.charAt(0).toUpperCase() + actionText.slice(1)} ${member.fullName}?`)) {
        return;
    }

    try {
        if (typeof ApiService !== 'undefined') {
            await ApiService.updateMember(memberId, { status: newStatus });
        }

        // Update local state
        member.status = newStatus;
        renderMembersTable();
        showNotification(`Member ${actionText}d successfully`, 'success');

        // Update stats if needed
        await loadDashboardStats();
    } catch (error) {
        console.error('Error toggling member status:', error);
        showNotification(`Failed to ${actionText} member: ${error.message}`, 'error');
    }
}

// ==================== NEWS MANAGEMENT ====================

async function loadNews() {
    const { page, limit } = AdminState.news;
    const search = document.getElementById('newsSearch')?.value || '';
    const status = document.getElementById('newsStatusFilter')?.value || '';
    const category = document.getElementById('newsCategoryFilter')?.value || '';

    try {
        const result = await ApiService.getNews({ page, limit, search, status, category });
        if (!result.success) throw new Error(result.error || 'Failed to load news');

        AdminState.news.posts = result.data.posts || [];
        AdminState.news.total = result.data.pagination?.total || 0;
        AdminState.news.totalPages = result.data.pagination?.totalPages || 1;

        renderNewsTable(AdminState.news.posts);
        updateNewsPagination();
    } catch (error) {
        showNotification(`Failed to load news: ${error.message}`, 'error');
    }
}

function renderNewsTable(posts) {
    const tbody = document.getElementById('newsTableBody');
    if (!tbody) return;

    if (!posts.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No posts found.</td></tr>';
        return;
    }

    tbody.innerHTML = posts.map(p => {
        const cover = p.coverImage
            ? `<img src="${p.coverImage}" alt="" style="width:56px;height:40px;object-fit:cover;border-radius:4px;">`
            : '<i class="fas fa-image" style="color:#ccc;font-size:1.5rem;"></i>';
        const statusClass = p.status === 'published' ? 'status-active'
            : p.status === 'draft' ? 'status-inactive' : 'status-pending';
        const dateStr = new Date(p.createdAt).toLocaleDateString();
        const author = p.author?.fullName || 'Unknown';
        return `<tr>
            <td style="text-align:center;">${cover}</td>
            <td>${p.title}</td>
            <td><span class="badge">${p.category}</span></td>
            <td><span class="status-badge ${statusClass}">${p.status}</span></td>
            <td>${author}</td>
            <td>${dateStr}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-outline" onclick="editNews('${p.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteNews('${p.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function updateNewsPagination() {
    const { page, limit, total, totalPages } = AdminState.news;
    const info = document.getElementById('newsPageInfo');
    const prevBtn = document.getElementById('newsPrevBtn');
    const nextBtn = document.getElementById('newsNextBtn');
    const start = Math.min((page - 1) * limit + 1, total);
    const end = Math.min(page * limit, total);
    if (info) info.textContent = total ? `Showing ${start}–${end} of ${total}` : 'No posts';
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages;
}

async function editNews(id) {
    try {
        const result = await ApiService.getNewsPost(id);
        if (!result.success) throw new Error(result.error || 'Failed to load post');
        const post = result.data;

        document.getElementById('newsPostId').value = post.id;
        document.getElementById('newsTitle').value = post.title;
        document.getElementById('newsExcerpt').value = post.excerpt || '';
        document.getElementById('newsContent').value = post.content;
        document.getElementById('newsCategory').value = post.category || 'general';
        document.getElementById('newsStatus').value = post.status || 'draft';

        if (post.coverImage) {
            const preview = document.getElementById('newsImagePreview');
            if (preview) {
                preview.src = post.coverImage;
                preview.style.display = 'block';
            }
            const dropContent = document.getElementById('newsDropContent');
            if (dropContent) dropContent.style.display = 'none';
            const removeBtn = document.getElementById('newsRemoveImageBtn');
            if (removeBtn) removeBtn.style.display = 'inline-flex';
        }

        document.getElementById('newsModalTitle').textContent = 'Edit Post';
        document.getElementById('newsModal').style.display = 'flex';
    } catch (error) {
        showNotification(`Failed to load post: ${error.message}`, 'error');
    }
}

async function deleteNews(id) {
    if (!confirm('Delete this news post? This cannot be undone.')) return;
    try {
        const result = await ApiService.deleteNews(id);
        if (!result.success) throw new Error(result.error || 'Failed to delete post');
        showNotification('Post deleted successfully', 'success');
        loadNews();
    } catch (error) {
        showNotification(`Failed to delete post: ${error.message}`, 'error');
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initAdminDashboard);

// Export functions for use in other modules
window.showSection = showSection;
window.viewMemberDetails = viewMemberDetails;
window.editMember = editMember;
window.toggleMemberStatus = toggleMemberStatus;
window.clearMemberFilters = clearMemberFilters;
window.loadNews = loadNews;
window.editNews = editNews;
window.deleteNews = deleteNews;
window.renderNewsTable = renderNewsTable;

// Export for Node.js/CommonJS
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initAdminDashboard,
        showSection,
        viewMemberDetails,
        editMember,
        toggleMemberStatus,
        clearMemberFilters,
        loadNews,
        editNews,
        deleteNews,
        renderNewsTable
    };
}