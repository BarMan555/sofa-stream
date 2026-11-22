// --- UI Authorization & View State Management ---

function switchView(viewId) {
    const enteringView = document.getElementById(viewId)?.classList.contains('hidden');
    document.querySelector('.container')?.classList.toggle('room-active', viewId === 'room-view');
    const mainMenu = document.getElementById('main-menu');
    const settingsForm = document.getElementById('settings-form');
    const roomView = document.getElementById('room-view');
    
    if (mainMenu) mainMenu.classList.add('hidden');
    if (settingsForm) settingsForm.classList.add('hidden');
    if (roomView) roomView.classList.add('hidden');
    
    if (viewId === 'main-menu') {
        if (mainMenu) mainMenu.classList.remove('hidden');
    } else if (viewId === 'settings-form') {
        if (settingsForm) settingsForm.classList.remove('hidden');
    } else if (viewId === 'room-view') {
        if (roomView) roomView.classList.remove('hidden');
    }

    if (enteringView) {
        const focusTarget = viewId === 'settings-form' ? 'settings-heading'
            : viewId === 'room-view' ? 'room-name-display' : 'btn-menu-create';
        document.getElementById(focusTarget)?.focus?.({ preventScroll: true });
        window.scrollTo?.({ top: 0, behavior: 'instant' });
    }
}

function switchTab(tabName) {
    const createBtn = document.getElementById('tabCreateBtn');
    const joinBtn = document.getElementById('tabJoinBtn');
    const createContent = document.getElementById('tabCreateContent');
    const joinContent = document.getElementById('tabJoinContent');

    if (createBtn && joinBtn && createContent && joinContent) {
        if (tabName === 'create') {
            createBtn.classList.add('active');
            joinBtn.classList.remove('active');
            createContent.classList.add('active');
            joinContent.classList.remove('active');
        } else {
            createBtn.classList.remove('active');
            joinBtn.classList.add('active');
            createContent.classList.remove('active');
            joinContent.classList.add('active');
        }
    }
}

function applyRoomTheme(themeName) {
    document.body.classList.remove('theme-princess', 'theme-warm', 'theme-dark');
    if (themeName === 'Princess') {
        document.body.classList.add('theme-princess');
    } else if (themeName === 'WarmHome') {
        document.body.classList.add('theme-warm');
    } else {
        document.body.classList.add('theme-dark');
    }
}

function updateHostUiVisibility() {
    const hostPanel = document.getElementById('hostControlsPanel');
    if (hostPanel) {
        hostPanel.style.display = isHost ? 'block' : 'none';
    }
    const emptyDescription = document.getElementById('emptyStateDescription');
    if (emptyDescription) emptyDescription.textContent = isHost
        ? 'Add a video link above to start your shared movie night.'
        : 'Your host is picking something good. Get comfortable.';
}

function updateParticipantUi() {
    const el = document.getElementById('participant-count');
    if (el) {
        const count = activeParticipants.size;
        el.textContent = `${count} participant${count !== 1 ? 's' : ''}`;
        window.chatUi?.updateCount(count);
    }
}

function showPlayerBlock() {
    const emptyState = document.getElementById('playerEmptyState');
    if (emptyState) emptyState.hidden = true;
    const theater = document.getElementById('theaterContainer');
    if (theater) {
        theater.style.display = 'flex';
    }
}

function hidePlayerBlock() {
    const emptyState = document.getElementById('playerEmptyState');
    if (emptyState) emptyState.hidden = false;
    const theater = document.getElementById('theaterContainer');
    if (theater) {
        theater.style.display = 'none';
    }
}

// Fullscreen Controls Auto-Hide & Hover Interactive Blueprint
let inactivityTimer;
const INACTIVITY_DURATION_MS = 3000;

function setupFullscreenControls() {
    const theaterContainer = document.getElementById('theaterContainer');
    const controlsPanel = document.querySelector('.custom-controls-panel');
    
    if (!theaterContainer || !controlsPanel) return;

    function showControls() {
        controlsPanel.classList.add('controls-visible');
    }

    function hideControls() {
        if (document.fullscreenElement) {
            controlsPanel.classList.remove('controls-visible');
        }
    }

    function resetInactivityTimer() {
        clearTimeout(inactivityTimer);
        if (controlsPanel.matches(':hover, :focus-within')) {
            return;
        }
        inactivityTimer = setTimeout(hideControls, INACTIVITY_DURATION_MS);
    }

    function handleMouseMove() {
        showControls();
        resetInactivityTimer();
    }

    theaterContainer.addEventListener('mousemove', handleMouseMove);
    theaterContainer.addEventListener('mouseenter', handleMouseMove);
    theaterContainer.addEventListener('mouseleave', hideControls);

    controlsPanel.addEventListener('mouseenter', () => {
        clearTimeout(inactivityTimer);
        showControls();
    });

    controlsPanel.addEventListener('mouseleave', () => {
        resetInactivityTimer();
    });

    controlsPanel.addEventListener('focusin', () => {
        clearTimeout(inactivityTimer);
        showControls();
    });
    controlsPanel.addEventListener('focusout', resetInactivityTimer);

    window.showControls = showControls;
    window.resetInactivityTimer = resetInactivityTimer;
}

window.switchView = switchView;
window.switchTab = switchTab;
window.applyRoomTheme = applyRoomTheme;
window.updateHostUiVisibility = updateHostUiVisibility;
window.updateParticipantUi = updateParticipantUi;
window.showPlayerBlock = showPlayerBlock;
window.hidePlayerBlock = hidePlayerBlock;
window.setupFullscreenControls = setupFullscreenControls;
