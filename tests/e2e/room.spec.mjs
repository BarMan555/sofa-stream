import { test, expect, enterRoom, roomState } from './fixtures.mjs';

test('two participants see the same persisted room and host controls', async ({ roomPages, request }) => {
  const { host, guest } = roomPages;
  const roomId = await enterRoom(host, guest);
  await expect(host.locator('#hostControlsPanel')).toBeVisible();
  await expect(guest.locator('#hostControlsPanel')).toBeHidden();
  const state = await roomState(host, roomId);
  expect(state.name).toBe('Harness Movie Night');
  expect(state.participants).toHaveLength(2);
  expect(state.participants.filter(participant => participant.isHost)).toHaveLength(1);
});

test('play, pause and seek propagate through the real API and SignalR', async ({ roomPages, request }) => {
  const { host, guest } = roomPages;
  const roomId = await enterRoom(host, guest);
  await host.locator('#videoUrlInput').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await host.locator('#btn-change-video').click();
  for (const page of [host, guest]) {
    await page.waitForFunction(() => window.videoPlayer.currentVideoId === 'dQw4w9WgXcQ' && !window.syncMachine.isProcessingRemoteEvent);
  }
  await expect(host.locator('#customPlayBtn')).toBeEnabled();
  await host.locator('#customPlayBtn').click();
  for (const page of [host, guest])
    await expect.poll(() => page.evaluate(() => window.videoPlayer.getPlayerState())).toBe(1);

  await expect(host.locator('#customPauseBtn')).toBeEnabled();
  await host.locator('#customPauseBtn').click();
  for (const page of [host, guest])
    await expect.poll(() => page.evaluate(() => window.videoPlayer.getPlayerState())).toBe(2);

  await host.locator('#customProgressBar').evaluate(element => {
    element.value = '120';
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  for (const page of [host, guest])
    await expect.poll(() => page.evaluate(() => window.videoPlayer.getCurrentTime())).toBe(120);
  const state = await roomState(host, roomId);
  expect(state.playbackState).toBe('Paused');
  expect(state.currentPositionSeconds).toBe(120);
});

test('leaving host promotes the remaining participant in UI and database', async ({ roomPages, request }) => {
  const { host, guest } = roomPages;
  const roomId = await enterRoom(host, guest);
  await host.locator('#btn-leave-room').click();
  await expect(host.locator('#main-menu')).toBeVisible();
  await expect(guest.locator('#hostControlsPanel')).toBeVisible();
  await expect(guest.locator('#participant-count')).toHaveText('👥 1 participant');
  const state = await roomState(guest, roomId);
  expect(state.participants).toHaveLength(1);
  expect(state.participants[0].isHost).toBe(true);
});
