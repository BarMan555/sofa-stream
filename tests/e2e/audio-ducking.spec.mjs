import { test, expect } from './fixtures.mjs';

test('Web Audio speech ducks the movie and leaving the room restores volume and closes analysis', async ({ roomPages }) => {
  const { host } = roomPages;
  await host.locator('#btn-menu-create').click();
  await host.locator('#userNameInput').fill('Speaker');
  await host.locator('#roomNameInput').fill('Audio ducking regression');
  await host.locator('#btn-settings-confirm').click();
  await expect(host.locator('#room-view')).toBeVisible();
  await host.waitForFunction(() => Boolean(localStream && duckingTimerId !== null));
  await host.locator('#btnToggleCollapse').click();

  await host.locator('#videoUrlInput').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await host.locator('#btn-change-video').click();
  await expect(host.locator('#customPlayBtn')).toBeEnabled();
  await host.locator('#customPlayBtn').click();
  await expect.poll(() => host.evaluate(() => window.videoPlayer.getPlayerState())).toBe(1);

  try {
    await host.evaluate(async () => {
      // Generate a real MediaStream and analyse it through the production Web Audio graph.
      const signalContext = new AudioContext();
      await signalContext.resume();
      const oscillator = signalContext.createOscillator();
      const gain = signalContext.createGain();
      const destination = signalContext.createMediaStreamDestination();
      gain.gain.value = 0;
      oscillator.connect(gain);
      gain.connect(destination);
      oscillator.start();
      registerAudioAnalyser('local', destination.stream);
      window.duckingTestSignal = { signalContext, oscillator, gain, stream: destination.stream, analysisContext: audioContext, originalMedia: localStream };
    });
    const volume = () => host.evaluate(() => window.videoPlayer.ytPlayer.volume);
    await expect.poll(volume).toBe(100);

    await host.evaluate(() => { window.duckingTestSignal.gain.gain.value = 0.2; });
    await expect.poll(volume).toBe(30);
    await expect(host.locator('#slot-local')).toHaveClass(/active-speaker/);

    await host.evaluate(() => { window.duckingTestSignal.gain.gain.value = 0; });
    await expect.poll(volume).toBe(100);
    await expect(host.locator('#slot-local')).not.toHaveClass(/active-speaker/);

    await host.evaluate(() => { window.duckingTestSignal.gain.gain.value = 0.2; });
    await expect.poll(volume).toBe(30);
    await host.locator('#btn-leave-room').click();
    await expect(host.locator('#main-menu')).toBeVisible();
    await expect.poll(volume).toBe(100);
    await expect.poll(() => host.evaluate(() => window.duckingTestSignal.analysisContext.state)).toBe('closed');
    expect(await host.evaluate(() => window.duckingTestSignal.originalMedia.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
  } finally {
    await host.evaluate(async () => {
      const signal = window.duckingTestSignal;
      if (!signal) return;
      signal.oscillator.stop();
      signal.stream.getTracks().forEach(track => track.stop());
      await signal.signalContext.close();
      delete window.duckingTestSignal;
    });
  }
});
