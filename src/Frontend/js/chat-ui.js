// Presentation of the call; media tracks and signalling remain owned by webrtc.js.
(() => {
    const paths = {
        mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
        camera: '<rect x="3" y="5" width="13" height="14" rx="3"/><path d="m16 10 5-3v10l-5-3"/>',
        grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
        large: '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/>',
    };
    const palettes = [['#d5c4fb', '#302a40'], ['#d2e4b2', '#2f3928'], ['#f4d4b7', '#453127'], ['#c3dfee', '#293b4a']];
    const observed = new WeakSet();

    function icon(name, off = false) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(key, value);
        // Only fixed local icon paths are inserted here, never participant data.
        svg.innerHTML = paths[name] + (off ? '<path d="m3 3 18 18"/>' : '');
        return svg;
    }

    function node(tag, className, text) {
        const el = document.createElement(tag);
        el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }

    function decorateParticipant(slot, name, local = false) {
        if (!slot.querySelector('.video-placeholder')) {
            const placeholder = node('div', 'video-placeholder');
            placeholder.append(node('span', 'participant-avatar'), node('span', 'participant-camera-state', 'Connecting…'));
            const label = node('div', 'video-label');
            label.append(node('span', 'participant-name'));
            if (local) label.append(node('span', 'participant-you', 'You'));
            const controls = node('div', 'slot-controls');
            const mic = node('span', 'mic-indicator active');
            if (local) mic.id = 'localMicIndicator';
            mic.append(icon('mic', true));
            const speaker = node('span', 'speaker-indicator');
            speaker.setAttribute('aria-hidden', 'true');
            speaker.append(node('span', ''), node('span', ''), node('span', ''));
            controls.append(mic, speaker);
            slot.append(placeholder, label, controls);
            slot.setAttribute('role', 'group');
        }
        const video = slot.querySelector('video');
        if (video && !observed.has(video)) {
            observed.add(video);
            video.addEventListener('loadeddata', () => updateVideoState(slot));
            video.addEventListener('playing', () => updateVideoState(slot));
            video.addEventListener('emptied', () => updateVideoState(slot));
        }
        setName(slot, name);
    }

    function setName(slot, name) {
        const text = typeof name === 'string' && name.trim() ? name.trim() : 'Guest';
        const label = slot.querySelector('.participant-name');
        const avatar = slot.querySelector('.participant-avatar');
        if (label) label.textContent = text;
        if (avatar) {
            const words = text.split(/\s+/);
            avatar.textContent = (Array.from(words[0])[0] + (words.length > 1 ? Array.from(words.at(-1))[0] : '')).toLocaleUpperCase();
            avatar.setAttribute('aria-hidden', 'true');
        }
        const hash = Array.from(text).reduce((sum, char) => sum + char.codePointAt(0), 0);
        const [ink, background] = palettes[hash % palettes.length];
        slot.style.setProperty('--avatar-ink', ink);
        slot.style.setProperty('--avatar-surface', background);
        slot.setAttribute('aria-label', text + (slot.classList.contains('local-slot') ? ' (You)' : ''));
        if (label) label.title = text;
    }

    function updateVideoState(slot) {
        const video = slot.querySelector('video');
        const ready = Boolean(video?.srcObject && video.readyState >= 2);
        slot.classList.toggle('has-video', ready);
        const state = slot.querySelector('.participant-camera-state');
        if (state) state.textContent = slot.dataset.mediaUnavailable === 'true' ? 'Camera unavailable'
            : slot.classList.contains('camera-off') ? 'Camera off' : 'Connecting…';
    }

    function setMedia(slot, audio, video, unavailable = false) {
        if (!slot) return;
        slot.classList.toggle('camera-off', !video);
        slot.classList.toggle('microphone-off', !audio);
        slot.dataset.mediaUnavailable = String(unavailable);
        const indicator = slot.querySelector('.mic-indicator');
        if (indicator) {
            indicator.classList.toggle('active', Boolean(audio));
            indicator.classList.toggle('muted', !audio);
            indicator.title = audio ? 'Microphone on' : 'Microphone off';
            indicator.setAttribute('aria-label', indicator.title);
        }
        updateVideoState(slot);
    }

    function attachStream(slot, stream) {
        const video = slot?.querySelector('video');
        if (!video) return;
        if (video.srcObject !== stream) {
            slot.classList.remove('has-video');
            video.srcObject = stream;
        }
        updateVideoState(slot);
    }

    function setLocalControls(audio, video, available = true) {
        for (const [id, kind, enabled, text] of [['btnToggleAudio', 'mic', audio, 'Mic'], ['btnToggleVideo', 'camera', video, 'Camera']]) {
            const button = document.getElementById(id);
            if (!button) continue;
            const label = kind === 'mic' ? 'Microphone' : 'Camera';
            button.replaceChildren(icon(kind, !enabled), node('span', 'chat-control-label', text + (enabled ? ' on' : ' off')));
            button.classList.toggle('muted', !enabled);
            button.setAttribute('aria-label', label);
            button.setAttribute('aria-pressed', String(Boolean(enabled)));
            button.title = available ? `Turn ${label.toLowerCase()} ${enabled ? 'off' : 'on'}` : `${label} unavailable`;
            button.disabled = !available;
        }
        const notice = document.getElementById('chatMediaNotice');
        if (notice) notice.hidden = available;
    }

    function setLayout(large, count) {
        const button = document.getElementById('btnToggleMinimize');
        if (!button) return;
        button.replaceChildren(icon(large ? 'grid' : 'large'));
        button.setAttribute('aria-label', large ? 'Show video grid' : 'Show large videos');
        button.title = button.getAttribute('aria-label');
        button.setAttribute('aria-pressed', String(!large));
        button.disabled = count < 2;
    }

    function updateCount(count) {
        for (const id of ['chatParticipantCount', 'chatRestoreCount']) {
            const el = document.getElementById(id);
            if (!el) continue;
            el.textContent = `${count}/4`;
            el.setAttribute('aria-label', `${count} of 4 participants`);
        }
    }

    window.chatUi = { decorateParticipant, setName, setMedia, attachStream, setLocalControls, setLayout, updateCount };
})();
