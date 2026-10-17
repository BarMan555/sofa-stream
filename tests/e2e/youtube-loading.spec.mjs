import { test, expect, enterRoom, roomState } from './fixtures.mjs';

async function loadVideo(host, id = 'M7lc1UVf-VE') {
  await host.locator('#videoUrlInput').fill(`https://www.youtube.com/watch?v=${id}`);
  await host.locator('#btn-change-video').click();
  await expect.poll(() => host.evaluate(() => window.videoPlayer.videoReady)).toBe(true);
  await expect(host.locator('#customPlayBtn')).toBeEnabled();
}

async function expectPaused(page) {
  await page.waitForFunction(() => window.videoPlayer.videoReady && !window.syncMachine.isProcessingRemoteEvent);
  expect(await page.evaluate(() => window.videoPlayer.getPlayerState())).not.toBe(1);
  expect(await page.evaluate(() => window.videoPlayer.getCurrentTime())).toBe(0);
}

test('the first video waits for the host even after a late native start', async ({ roomPages }) => {
  const { host, guest } = roomPages;
  const roomId = await enterRoom(host, guest);
  await loadVideo(host);
  for (const page of [host, guest]) await expectPaused(page);
  // YouTube can deliver a native start after a seek/pause command has completed.
  await guest.evaluate(() => window.videoPlayer.ytPlayer.setState(YT.PlayerState.PLAYING));
  await expect.poll(() => guest.evaluate(() => window.videoPlayer.getPlayerState())).toBe(2);
  expect((await roomState(host, roomId)).playbackState).toBe('Paused');
  await host.locator('#customPlayBtn').click();
  for (const page of [host, guest])
    await expect.poll(() => page.evaluate(() => window.videoPlayer.getPlayerState())).toBe(1);
  await host.locator('#customPauseBtn').click();
  for (const page of [host, guest])
    await expect.poll(() => page.evaluate(() => window.videoPlayer.getPlayerState())).toBe(2);
});

test.describe('a guest whose YouTube API arrives after four seconds', () => {
  test.use({ holdGuestYoutubeApi: true });

  for (const state of ['Paused', 'Playing']) {
    test(`waits safely and then restores the latest ${state} state`, async ({ roomPages }) => {
      const { host, guest, releaseGuestYoutubeApi } = roomPages;
      const roomId = await enterRoom(host, guest);
      await loadVideo(host);
      await expect(guest.locator('#playerStatus')).toBeVisible();
      await expect.poll(() => guest.evaluate(() => window.youtubeBlocked)).toBe(true);
      expect(await guest.locator('#rutubePlayer').getAttribute('src')).not.toContain('youtube.com/embed/');
      expect(await guest.evaluate(() => window.videoPlayer.videoReady)).toBe(false);
      expect((await roomState(host, roomId)).playbackState).toBe('Paused');
      if (state === 'Playing') {
        await host.locator('#customPlayBtn').click();
        await expect.poll(() => host.evaluate(() => window.videoPlayer.getCurrentTime())).toBeGreaterThan(2);
      } else {
        await loadVideo(host, 'Y2VF8tmLFHw');
        await guest.waitForFunction(() => window.videoPlayer.currentVideoId === 'Y2VF8tmLFHw');
      }
      await releaseGuestYoutubeApi();
      await expect(guest.locator('#playerStatus')).toBeHidden();
      if (state === 'Paused') {
        for (const page of [host, guest]) await expectPaused(page);
        await host.locator('#customPlayBtn').click();
      }
      for (const page of [host, guest])
        await expect.poll(() => page.evaluate(() => window.videoPlayer.getPlayerState())).toBe(1);
      await expect.poll(async () => Math.abs(
        await host.evaluate(() => window.videoPlayer.getCurrentTime()) - await guest.evaluate(() => window.videoPlayer.getCurrentTime()),
      )).toBeLessThan(0.8);
      await host.locator('#customPauseBtn').click();
      for (const page of [host, guest])
        await expect.poll(() => page.evaluate(() => window.videoPlayer.getPlayerState())).toBe(2);
    });
  }
});

test.describe('an unavailable YouTube API', () => {
  test.use({ failGuestYoutubeApi: true });

  test('shows the failure without an independent autoplay embed', async ({ roomPages }) => {
    const { host, guest } = roomPages;
    const roomId = await enterRoom(host, guest);
    await loadVideo(host);
    await expect(guest.locator('#playerStatus')).toContainText('Reload');
    expect(await guest.locator('#rutubePlayer').getAttribute('src')).not.toContain('youtube.com/embed/');
    expect((await roomState(host, roomId)).playbackState).toBe('Paused');
    await guest.locator('#btn-leave-room').click();
    await expect(guest.locator('#main-menu')).toBeVisible();
  });
});
