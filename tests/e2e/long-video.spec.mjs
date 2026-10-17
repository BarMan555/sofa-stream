import { test, expect, enterRoom, roomState } from './fixtures.mjs';

test('the player-reported duration is persisted and seeking past the first hour works for both participants', async ({ roomPages }) => {
  const { host, guest } = roomPages;
  const roomId = await enterRoom(host, guest);
  await host.locator('#videoUrlInput').fill('https://www.youtube.com/watch?v=M7lc1UVf-VE');
  await host.locator('#btn-change-video').click();
  await host.waitForFunction(() => window.videoPlayer.videoReady && !window.syncMachine.isProcessingRemoteEvent);
  await expect(host.locator('#customProgressBar')).toHaveAttribute('max', '7200');
  await host.locator('#customProgressBar').evaluate(element => {
    element.value = '3610'; element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(async () => (await roomState(host, roomId)).currentPositionSeconds).toBe(3610);
  await expect.poll(() => guest.evaluate(() => window.videoPlayer.getCurrentTime())).toBe(3610);
  expect((await roomState(host, roomId)).currentVideo.durationSeconds).toBe(7200);
  await host.locator('#customPlayBtn').click();
  for (const page of [host, guest])
    await expect.poll(() => page.evaluate(() => window.videoPlayer.getPlayerState())).toBe(1);
  await host.locator('#customPauseBtn').click();
  await expect.poll(async () => (await roomState(host, roomId)).playbackState).toBe('Paused');
  expect((await roomState(host, roomId)).currentPositionSeconds).toBeGreaterThanOrEqual(3610);
});

test('a rejected seek shows the reason and restores the server position', async ({ roomPages }) => {
  const { host, guest } = roomPages;
  const roomId = await enterRoom(host, guest);
  await host.locator('#videoUrlInput').fill('https://www.youtube.com/watch?v=M7lc1UVf-VE');
  await host.locator('#btn-change-video').click();
  await host.waitForFunction(() => window.videoPlayer.videoReady && !window.syncMachine.isProcessingRemoteEvent);
  await expect(host.locator('#customProgressBar')).toHaveAttribute('max', '7200');
  let rejected = false;
  let notice = '';
  host.once('dialog', async dialog => { notice = dialog.message(); await dialog.accept(); });
  await host.route('**/api/room/*/playback', async route => {
    if (!rejected) {
      rejected = true;
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'Room.InvalidPosition', description: 'Seek rejected by the server.' }) });
    } else await route.continue();
  });
  await host.locator('#customProgressBar').evaluate(element => {
    element.value = '3610'; element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(() => notice).toContain('Seek rejected');
  await expect.poll(() => host.evaluate(() => window.videoPlayer.getCurrentTime())).toBe(0);
  expect(await guest.evaluate(() => window.videoPlayer.getCurrentTime())).toBe(0);
  expect((await roomState(host, roomId)).currentPositionSeconds).toBe(0);
});

test('a network failure restores playback and the next seek still works', async ({ roomPages }) => {
  const { host, guest } = roomPages;
  const roomId = await enterRoom(host, guest);
  await host.locator('#videoUrlInput').fill('https://www.youtube.com/watch?v=M7lc1UVf-VE');
  await host.locator('#btn-change-video').click();
  await host.waitForFunction(() => window.videoPlayer.videoReady && !window.syncMachine.isProcessingRemoteEvent);
  await expect(host.locator('#customProgressBar')).toHaveAttribute('max', '7200');
  let notice = '';
  host.once('dialog', async dialog => { notice = dialog.message(); await dialog.accept(); });
  await host.route('**/api/room/*/playback', route => route.abort('failed'));
  await host.locator('#customProgressBar').evaluate(element => {
    element.value = '3610'; element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(() => notice.length).toBeGreaterThan(0);
  await expect.poll(() => host.evaluate(() => window.videoPlayer.getCurrentTime())).toBe(0);
  expect((await roomState(host, roomId)).currentPositionSeconds).toBe(0);
  await host.unroute('**/api/room/*/playback');
  await host.locator('#customProgressBar').evaluate(element => {
    element.value = '120'; element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(() => guest.evaluate(() => window.videoPlayer.getCurrentTime())).toBe(120);
});
