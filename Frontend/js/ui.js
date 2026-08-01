// --- UI Authorization & View State Management ---

function switchView(viewId) {
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
}

function updateParticipantUi() {
    const el = document.getElementById('participant-count');
    if (el) {
        const count = activeParticipants.size;
        el.textContent = `👥 ${count} participant${count !== 1 ? 's' : ''}`;
    }
}

function showPlayerBlock() {
    const theater = document.getElementById('theaterContainer');
    if (theater) {
        theater.style.display = 'flex';
    }
}

function hidePlayerBlock() {
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
        if (controlsPanel.matches(':hover')) {
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

    window.showControls = showControls;
    window.resetInactivityTimer = resetInactivityTimer;
}

// Click sparkle burst effect inside Princess theme
document.addEventListener('click', (e) => {
    if (!document.body.classList.contains('theme-princess')) return;
    
    const sparkleCount = 12;
    const body = document.body;
    
    for (let i = 0; i < sparkleCount; i++) {
        const sparkle = document.createElement('div');
        sparkle.className = 'click-sparkle';
        sparkle.innerText = Math.random() > 0.5 ? '✨' : '🌸';
        
        const angle = Math.random() * Math.PI * 2;
        const distance = 40 + Math.random() * 80;
        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance;
        const rot = (Math.random() - 0.5) * 360;
        
        sparkle.style.setProperty('--tx', `${tx}px`);
        sparkle.style.setProperty('--ty', `${ty}px`);
        sparkle.style.setProperty('--rot', `${rot}deg`);
        
        sparkle.style.left = `${e.pageX}px`;
        sparkle.style.top = `${e.pageY}px`;
        sparkle.style.animationDelay = `${Math.random() * 0.15}s`;
        
        body.appendChild(sparkle);
        
        setTimeout(() => {
            sparkle.remove();
        }, 1000);
    }
});

window.switchView = switchView;
window.switchTab = switchTab;
window.applyRoomTheme = applyRoomTheme;
window.updateHostUiVisibility = updateHostUiVisibility;
window.updateParticipantUi = updateParticipantUi;
window.showPlayerBlock = showPlayerBlock;
window.hidePlayerBlock = hidePlayerBlock;
window.setupFullscreenControls = setupFullscreenControls;
