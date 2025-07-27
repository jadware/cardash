import { checkTokenLogin, logout } from './util/auth.js';
import { get, getJSON } from './util/rest.js';
import { formatDateT } from './util/formatters.js';
import { registerTextHandler } from './sync/msg-handlers.js';
import socket from './sync/socket.js';
import { sync } from './sync/sync.js';

// Global variables
let allLogs = [];
let filteredLogs = [];
let isPaused = false;
let autoScroll = false;
let isDataLoaded = false;
let ws;

// DOM elements
const logsTbody = document.getElementById('logs-tbody');
const textFilter = document.getElementById('text-filter');
const typeInfoCheckbox = document.getElementById('type-info');
const typeWarningCheckbox = document.getElementById('type-warning');
const typeErrorCheckbox = document.getElementById('type-error');
const autoScrollCheckbox = document.getElementById('auto-scroll');
const pauseButton = document.getElementById('pause-logs');
const refreshButton = document.getElementById('refresh-logs');
const clearButton = document.getElementById('clear-logs');
const exportButton = document.getElementById('export-logs');
const logsContainer = document.querySelector('.logs-container');

// Initialize the application
async function init()
{
    // Check authentication
    await checkTokenLogin();
    
    // Set up event listeners
    setupEventListeners();
    
    // Load initial logs
    await loadInitialLogs();
    
    // Connect to WebSocket for real-time logs
    connectWebSocket();
    
    // Apply initial filters
    applyFilters();
    
    // Restore saved states
    restoreSavedStates();
    
    // Focus the container for keyboard navigation
    focusContainer();
}

function setupEventListeners()
{
    // Filter controls
    textFilter.addEventListener('input', applyFilters);
    textFilter.addEventListener('input', saveTextFilter);
    
    typeInfoCheckbox.addEventListener('change', applyFilters);
    typeInfoCheckbox.addEventListener('change', saveTypeStates);
    
    typeWarningCheckbox.addEventListener('change', applyFilters);
    typeWarningCheckbox.addEventListener('change', saveTypeStates);
    
    typeErrorCheckbox.addEventListener('change', applyFilters);
    typeErrorCheckbox.addEventListener('change', saveTypeStates);
    
    // Auto-scroll toggle
    autoScrollCheckbox.addEventListener('change', (e) =>
    {
        autoScroll = e.target.checked;
        saveAutoScrollState();

        if (autoScroll)
            scrollToBottom();
    });
    
    // Pause/Resume button
    pauseButton.addEventListener('click', togglePause);
    
    // Refresh logs
    refreshButton.addEventListener('click', refreshLogs);
    
    // Clear logs
    clearButton.addEventListener('click', clearLogs);
    
    // Export logs
    exportButton.addEventListener('click', exportLogs);
    
    // Manual scroll detection
    logsTbody.addEventListener('scroll', handleScroll);
    
    // Keyboard navigation
    logsContainer.addEventListener('keydown', handleKeyboardNavigation);
    
    // Ensure container can receive focus
    logsContainer.setAttribute('tabindex', '0');
}

function focusContainer()
{
    // Focus the container after a short delay to ensure DOM is ready
    setTimeout(() =>
    {
        logsContainer.focus();
    }, 100);
}

function handleKeyboardNavigation(event)
{
    switch (event.key)
    {
        case 'Home':
            event.preventDefault();
            scrollToTop();
            break;
        case 'End':
            event.preventDefault();
            scrollToBottom();
            break;
        case 'PageUp':
            event.preventDefault();
            scrollPageUp();
            break;
        case 'PageDown':
            event.preventDefault();
            scrollPageDown();
            break;
    }
}

function scrollToTop()
{
    if (logsTbody)
        logsTbody.scrollTop = 0;
}

function scrollPageUp()
{
    if (logsTbody) {
        const currentScrollTop = logsTbody.scrollTop;
        const clientHeight = logsTbody.clientHeight;
        logsTbody.scrollTop = Math.max(0, currentScrollTop - clientHeight);
    }
}

function scrollPageDown()
{
    if (logsTbody) {
        const currentScrollTop = logsTbody.scrollTop;
        const clientHeight = logsTbody.clientHeight;
        const scrollHeight = logsTbody.scrollHeight;
        logsTbody.scrollTop = Math.min(scrollHeight - clientHeight, currentScrollTop + clientHeight);
    }
}

async function loadInitialLogs()
{
    isDataLoaded = false;

    try
    {
        const response = await getJSON('/logs');

        if (response && Array.isArray(response))
        {
            allLogs = response.map(log => ({
                ...log,
                t: new Date(log.t)
            })).sort((a, b) => a.t - b.t);

            renderLogs();

            // Mark data as loaded and restore scroll position
            isDataLoaded = true;
            setTimeout(() => {
                restoreScrollPosition();
            }, 50);
        }
    }
    catch (error)
    {
        console.error('Failed to load initial logs:', error);
        addLogEntry(
        {
            t: new Date(),
            type: 'e',
            message: 'Failed to load initial logs: ' + error.message,
        });
    }
}

function connectWebSocket()
{
    ws = new socket();
    
    ws.addEventListener('connected', () =>
    {
        ws.json(sync.FEATURE_SUBSCRIBE, [ 'debug-log' ]);
    });
    
    ws.addEventListener('disconnected', () =>
    {
    });
    
    // Register log message handler
    registerTextHandler(sync.LOG, handleLogMessage);
    
    ws.connect();
}

function handleLogMessage(log)
{
    if (isPaused)
        return;
    
    allLogs.push(log);
    
    // Keep only last 10000 logs to prevent memory issues
    if (allLogs.length > 10000)
        allLogs = allLogs.slice(2500);
    
    // Check if this log passes current filters
    if (passesFilters(log))
        addLogEntry(log);
}

function addLogEntry(log)
{
    const row = document.createElement('tr');
    row.className = 'log-entry';
    
    // Add row coloring based on type
    if (log.type === 'w') {
        row.classList.add('table-warning');
    } else if (log.type === 'e') {
        row.classList.add('table-danger');
    }
    
    const type = document.createElement('td');
    type.className = `log-type ${log.type || 'i'}`;
    type.textContent = (log.type || 'i').toUpperCase();
    
    const timestamp = document.createElement('td');
    timestamp.className = 'log-timestamp';
    
    // Format timestamp in user's timezone
    const date = new Date(log.t);
    const timeString = date.toLocaleTimeString('en-US', { 
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
    // Create tooltip with "X seconds ago" information
    const timeAgo = formatDateT(log.t);
    
    timestamp.textContent = timeString;
    timestamp.title = `${date.toLocaleString()} (${timeAgo})`;
    
    const room = document.createElement('td');
    room.className = 'log-room';
    room.textContent = log.room_name || '-';
    
    const message = document.createElement('td');
    message.className = 'log-message';
    message.textContent = log.message || '';
    
    row.appendChild(type);
    row.appendChild(timestamp);
    row.appendChild(room);
    row.appendChild(message);
    
    logsTbody.appendChild(row);
    
    if (autoScroll)
        scrollToBottom();
}

function applyFilters()
{
    const textValue = textFilter.value.toLowerCase();
    const selectedTypes = getSelectedTypes();
    
    filteredLogs = allLogs.filter(log =>
    {
        // Text filter
        if (textValue && !log.message?.toLowerCase().includes(textValue)) {
            return false;
        }
        
        // Type filter
        if (selectedTypes.length > 0 && !selectedTypes.includes(log.type || 'i')) {
            return false;
        }
        
        return true;
    });
    
    renderLogs();
}

function getSelectedTypes()
{
    const types = [];
    if (typeInfoCheckbox.checked) types.push('i');
    if (typeWarningCheckbox.checked) types.push('w');
    if (typeErrorCheckbox.checked) types.push('e');
    return types;
}

function passesFilters(log)
{
    const textValue = textFilter.value.toLowerCase();
    const selectedTypes = getSelectedTypes();
    
    // Text filter
    if (textValue && !log.message?.toLowerCase().includes(textValue))
        return false;
    
    // Type filter
    if (selectedTypes.length > 0 && !selectedTypes.includes(log.type || 'i'))
        return false;
    
    return true;
}

function renderLogs()
{
    logsTbody.innerHTML = '';
    
    filteredLogs.forEach(log =>
    {
        addLogEntry(log);
    });
    
    if (autoScroll)
        scrollToBottom();
    else
        // Restore scroll position after rendering with longer delay
        setTimeout(() => {
            restoreScrollPosition();
        }, 200);
}

function togglePause()
{
    isPaused = !isPaused;
    
    if (isPaused)
    {
        pauseButton.innerHTML = '<i class="bi bi-play"></i> Resume';
        pauseButton.classList.remove('btn-outline-secondary');
        pauseButton.classList.add('btn-outline-success');
    }
    else
    {
        pauseButton.innerHTML = '<i class="bi bi-pause"></i> Pause';
        pauseButton.classList.remove('btn-outline-success');
        pauseButton.classList.add('btn-outline-secondary');
    }
}

function clearLogs()
{
    allLogs = [];
    filteredLogs = [];
    logsTbody.innerHTML = '';
}

function exportLogs()
{
    const exportData = filteredLogs.map(log => ({
        timestamp: log.t.toISOString(),
        type: log.type || 'i',
        message: log.message || ''
    }));
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function scrollToBottom()
{
    logsTbody.scrollTop = logsTbody.scrollHeight;
}

function handleScroll()
{
    // Save scroll position when user scrolls
    saveScrollPosition();
    
    // If user scrolls up, disable auto-scroll
    const isAtBottom = logsTbody.scrollTop + logsTbody.clientHeight >= logsTbody.scrollHeight - 10;
    
    if (!isAtBottom && autoScroll)
    {
        autoScrollCheckbox.checked = false;
        autoScroll = false;
        saveAutoScrollState();
    }
    else if (isAtBottom && !autoScroll)
    {
        // Re-enable auto-scroll when user scrolls to bottom
        autoScrollCheckbox.checked = true;
        autoScroll = true;
        saveAutoScrollState();
        // Clear saved scroll position when auto-scroll is re-enabled
        localStorage.removeItem('logs-scroll-position');
    }
}

async function refreshLogs()
{
    isDataLoaded = false;
    try
    {
        await loadInitialLogs();
        applyFilters();
    }
    catch (error)
    {
        console.error('Failed to refresh logs:', error);

        isDataLoaded = true; // Mark as loaded even on error
    }
}

function restoreSavedStates()
{
    // Restore text filter
    const savedTextFilter = localStorage.getItem('logs-text-filter');
    if (savedTextFilter) {
        textFilter.value = savedTextFilter;
    }
    
    // Restore type toggle states
    const savedTypeStates = JSON.parse(localStorage.getItem('logs-type-states') || '{"info": true, "warning": true, "error": true}');
    typeInfoCheckbox.checked = savedTypeStates.info;
    typeWarningCheckbox.checked = savedTypeStates.warning;
    typeErrorCheckbox.checked = savedTypeStates.error;
    
    // Restore auto-scroll state
    const savedAutoScroll = localStorage.getItem('logs-auto-scroll');
    if (savedAutoScroll !== null) {
        autoScroll = savedAutoScroll === 'true';
        autoScrollCheckbox.checked = autoScroll;
    }
    
    // Apply filters with restored states
    applyFilters();
}

function saveTextFilter()
{
    localStorage.setItem('logs-text-filter', textFilter.value);
}

function saveTypeStates()
{
    const typeStates = {
        info: typeInfoCheckbox.checked,
        warning: typeWarningCheckbox.checked,
        error: typeErrorCheckbox.checked
    };
    localStorage.setItem('logs-type-states', JSON.stringify(typeStates));
}

function saveAutoScrollState()
{
    localStorage.setItem('logs-auto-scroll', autoScroll.toString());
}

function saveScrollPosition()
{
    // Only save scroll position if data is fully loaded and not auto-scrolling
    if (!autoScroll && isDataLoaded && allLogs.length > 0)
    {
        const scrollTop = logsTbody.scrollTop;
        const scrollHeight = logsTbody.scrollHeight;
        const clientHeight = logsTbody.clientHeight;
        
        // Save scroll position as percentage of total scrollable area
        const scrollPercentage = scrollHeight > 0 ? (scrollTop / (scrollHeight - clientHeight)) * 100 : 0;
        
        localStorage.setItem('logs-scroll-position', scrollPercentage.toString());
    }
}

function restoreScrollPosition()
{
    // Only restore scroll position if data is fully loaded
    if (!autoScroll && isDataLoaded && allLogs.length > 0)
    {
        const savedScrollPercentage = localStorage.getItem('logs-scroll-position');
        if (savedScrollPercentage !== null)
        {
            const percentage = parseFloat(savedScrollPercentage);
            const scrollHeight = logsTbody.scrollHeight;
            const clientHeight = logsTbody.clientHeight;
            const maxScrollTop = scrollHeight - clientHeight;
            
            if (maxScrollTop > 0)
            {
                const scrollTop = (percentage / 100) * maxScrollTop;
                logsTbody.scrollTop = scrollTop;
            }
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);