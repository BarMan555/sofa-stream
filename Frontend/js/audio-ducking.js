// --- Audio Ducking (Speech detection & automatic player volume ducking) ---
let audioAnalysers = {};
let audioContext = null;
let isSomeoneSpeaking = false;
let movieVolume = readMovieVolume();
let currentActualVolume = movieVolume;
let currentTargetVolume = movieVolume;
let duckingTimerId = null;

function readMovieVolume() {
    try {
        const saved = window.localStorage.getItem('sofastream.volume');
        const value = Number(saved);
        if (saved !== null && saved.trim() !== '' && Number.isFinite(value) && value >= 0 && value <= 100)
            return Math.round(value);
    } catch { /* Volume controls also work without browser storage. */ }
    return 100;
}

function applyMovieVolume() {
    window.videoPlayer?.setVolume?.(currentActualVolume);
}

function updateMovieVolumeControls() {
    const slider = document.getElementById('customVolumeSlider');
    const value = document.getElementById('customVolumeValue');
    const status = document.getElementById('duckingStatus');
    if (slider) slider.value = String(movieVolume);
    if (value) value.textContent = `${movieVolume}%`;
    if (status) {
        status.hidden = !isSomeoneSpeaking || movieVolume === 0;
        status.textContent = `Speech: ${Math.round(currentTargetVolume)}%`;
    }
}

function setMovieVolume(value) {
    const level = Number(value);
    if (!Number.isFinite(level)) return;
    movieVolume = Math.round(Math.max(0, Math.min(100, level)));
    try { window.localStorage.setItem('sofastream.volume', String(movieVolume)); } catch { }
    currentTargetVolume = movieVolume * (isSomeoneSpeaking ? 0.3 : 1);
    // Manual changes take effect immediately, including during automatic ducking.
    currentActualVolume = currentTargetVolume;
    applyMovieVolume();
    updateMovieVolumeControls();
}

function setupMovieVolumeControls() {
    document.getElementById('customVolumeSlider')?.addEventListener('input', event => setMovieVolume(event.target.value));
    updateMovieVolumeControls();
    applyMovieVolume();
}

function registerAudioAnalyser(id, stream) {
    try {
        const key = id.toLowerCase();
        unregisterAudioAnalyser(key);
        if (!stream || stream.getAudioTracks().length === 0) return;
        
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (audioContext.state === "suspended") {
            audioContext.resume().catch(error => console.warn("Audio Ducking: Could not resume audio context.", error));
        }
        
        console.log(`Audio Ducking: Registering analyser for source: ${key}`);
        
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        
        source.connect(analyser);
        audioAnalysers[key] = { source, analyser };
    } catch (e) {
        console.error(`Audio Ducking: Failed to register analyser for ${id}`, e);
    }
}

function unregisterAudioAnalyser(id) {
    const key = id.toLowerCase();
    if (audioAnalysers[key]) {
        console.log(`Audio Ducking: Unregistering analyser for source: ${key}`);
        audioAnalysers[key].source.disconnect();
        audioAnalysers[key].analyser.disconnect();
        delete audioAnalysers[key];
    }
    const slotId = key === "local" ? "slot-local" : `slot-${key}`;
    document.getElementById(slotId)?.classList.remove("active-speaker");
}

function resetAudioAnalysers() {
    for (const id of Object.keys(audioAnalysers)) unregisterAudioAnalyser(id);
    const context = audioContext;
    audioContext = null;
    if (context && context.state !== "closed") {
        context.close().catch(error => console.warn("Audio Ducking: Could not close audio context.", error));
    }
    isSomeoneSpeaking = false;
}

function startDuckingLoop() {
    if (duckingTimerId !== null) return;
    
    console.log("Audio Ducking: Speech detection loop started.");
    
    duckingTimerId = setInterval(() => {
        let maxRms = 0;
        
        for (const id in audioAnalysers) {
            const { analyser } = audioAnalysers[id];
            const dataArray = new Float32Array(analyser.fftSize);
            analyser.getFloatTimeDomainData(dataArray);
            
            let sumSquares = 0.0;
            for (const amplitude of dataArray) {
                sumSquares += amplitude * amplitude;
            }
            const rms = Math.sqrt(sumSquares / dataArray.length);
            if (rms > maxRms) {
                maxRms = rms;
            }
        }
        
        const speechThreshold = 0.015;
        isSomeoneSpeaking = (maxRms > speechThreshold);
        
        updateSpeakerVolumeIndicators();
        
        currentTargetVolume = movieVolume * (isSomeoneSpeaking ? 0.3 : 1);
        updateMovieVolumeControls();
        
        if (Math.abs(currentActualVolume - currentTargetVolume) > 1) {
            currentActualVolume += (currentTargetVolume - currentActualVolume) * 0.15;
            applyMovieVolume();
        } else if (currentActualVolume !== currentTargetVolume) {
            currentActualVolume = currentTargetVolume;
            applyMovieVolume();
        }
    }, 60);
}

function stopDuckingLoop() {
    if (duckingTimerId !== null) {
        clearInterval(duckingTimerId);
        duckingTimerId = null;
        console.log("Audio Ducking: Speech detection loop stopped.");
    }
    isSomeoneSpeaking = false;
    currentTargetVolume = movieVolume;
    if (currentActualVolume !== movieVolume) {
        currentActualVolume = movieVolume;
        applyMovieVolume();
    }
    updateMovieVolumeControls();
}

function updateSpeakerVolumeIndicators() {
    for (const id in audioAnalysers) {
        const { analyser } = audioAnalysers[id];
        const dataArray = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(dataArray);
        
        let sumSquares = 0.0;
        for (const amplitude of dataArray) {
            sumSquares += amplitude * amplitude;
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);
        const isSpeaking = (rms > 0.015);
        
        const slotId = (id === "local") ? "slot-local" : `slot-${id.toLowerCase()}`;
        const slotEl = document.getElementById(slotId);
        if (slotEl) {
            if (isSpeaking) {
                slotEl.classList.add("active-speaker");
            } else {
                slotEl.classList.remove("active-speaker");
            }
        }
    }
}

window.registerAudioAnalyser = registerAudioAnalyser;
window.unregisterAudioAnalyser = unregisterAudioAnalyser;
window.resetAudioAnalysers = resetAudioAnalysers;
window.startDuckingLoop = startDuckingLoop;
window.stopDuckingLoop = stopDuckingLoop;
window.setMovieVolume = setMovieVolume;
window.applyMovieVolume = applyMovieVolume;
window.setupMovieVolumeControls = setupMovieVolumeControls;
