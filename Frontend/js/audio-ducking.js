// --- Audio Ducking (Speech detection & automatic player volume ducking) ---
let audioAnalysers = {};
let audioContext = null;
let isSomeoneSpeaking = false;
let currentActualVolume = 100;
let currentTargetVolume = 100;
let duckingTimerId = null;

function registerAudioAnalyser(id, stream) {
    try {
        if (!stream || stream.getAudioTracks().length === 0) return;
        
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (audioContext.state === "suspended") {
            audioContext.resume();
        }
        
        const key = id.toLowerCase();
        console.log(`Audio Ducking: Registering analyser for source: ${key}`);
        
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        
        source.connect(analyser);
        audioAnalysers[key] = analyser;
    } catch (e) {
        console.error(`Audio Ducking: Failed to register analyser for ${id}`, e);
    }
}

function unregisterAudioAnalyser(id) {
    const key = id.toLowerCase();
    if (audioAnalysers[key]) {
        console.log(`Audio Ducking: Unregistering analyser for source: ${key}`);
        delete audioAnalysers[key];
    }
}

function resetAudioAnalysers() {
    audioAnalysers = {};
}

function startDuckingLoop() {
    if (duckingTimerId) return;
    
    console.log("Audio Ducking: Speech detection loop started.");
    
    duckingTimerId = setInterval(() => {
        let maxRms = 0;
        
        for (const id in audioAnalysers) {
            const analyser = audioAnalysers[id];
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
        
        if (isSomeoneSpeaking) {
            currentTargetVolume = 30; // Duck volume to 30%
        } else {
            currentTargetVolume = 100; // Restore to 100%
        }
        
        if (Math.abs(currentActualVolume - currentTargetVolume) > 1) {
            currentActualVolume += (currentTargetVolume - currentTargetVolume) * 0.15;
            if (window.videoPlayer && typeof window.videoPlayer.setVolume === 'function') {
                window.videoPlayer.setVolume(currentActualVolume);
            }
        } else if (currentActualVolume !== currentTargetVolume) {
            currentActualVolume = currentTargetVolume;
            if (window.videoPlayer && typeof window.videoPlayer.setVolume === 'function') {
                window.videoPlayer.setVolume(currentActualVolume);
            }
        }
    }, 60);
}

function stopDuckingLoop() {
    if (duckingTimerId) {
        clearInterval(duckingTimerId);
        duckingTimerId = null;
        console.log("Audio Ducking: Speech detection loop stopped.");
    }
}

function updateSpeakerVolumeIndicators() {
    for (const id in audioAnalysers) {
        const analyser = audioAnalysers[id];
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
