import { test, expect, roomState } from './fixtures.mjs';

async function prepareHost(host, request, playbackState) {
  await host.locator('#btn-menu-create').click();
  await host.locator('#userNameInput').fill('Host');
  await host.locator('#roomNameInput').fill('Late join regression');
  await host.locator('#btn-settings-confirm').click();
  await expect(host.locator('#room-view')).toBeVisible();
  await host.locator('#btnToggleCollapse').click();
  const roomId = await host.locator('#room-id-value').textContent();
  await host.locator('#videoUrlInput').fill('https://www.youtube.com/watch?v=M7lc1UVf-VE');
  await host.locator('#btn-change-video').click();
  await host.waitForFunction(() => !window.syncMachine.isProcessingRemoteEvent && window.videoPlayer.currentVideoId === 'M7lc1UVf-VE');
  const hostId = await host.evaluate(() => globalUserId);
  const playback = async state => {
    const ok = await host.evaluate(async ({ roomId, hostId, state }) => {
      const response = await window.apiFetch(`${API_BASE_URL}/api/room/${roomId}/playback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: hostId, requestedState: state, clientPosition: '00:00:42', videoRevision: window.syncMachine.serverVideoRevision }),
      });
      return response.ok;
    }, { roomId, hostId, state });
    expect(ok).toBe(true);
  };
  if (playbackState === 'Paused') await playback(0);
  else {
    await playback(1);
    await expect.poll(() => host.evaluate(() => window.videoPlayer.getPlayerState())).toBe(1);
    if (playbackState === 'Buffering') await playback(2);
    else await expect.poll(() => host.evaluate(() => window.videoPlayer.getCurrentTime())).toBeGreaterThan(45);
  }
  return roomId;
}

async function join(guest, roomId) {
  await guest.locator('#btn-menu-join').click();
  await guest.locator('#userNameInput').fill('Late guest');
  await guest.locator('#roomIdInput').fill(roomId);
  await guest.locator('#btn-settings-confirm').click();
  await expect(guest.locator('#room-view')).toBeVisible();
}

for (const state of ['Playing', 'Paused', 'Buffering']) {
  test(`late guest joins ${state} at the current room position`, async ({ roomPages, request }) => {
    const { host, guest } = roomPages;
    const roomId = await prepareHost(host, request, state);
    await join(guest, roomId);
    await expect.poll(() => guest.evaluate(() => window.videoPlayer.getPlayerState())).toBe(state === 'Playing' ? 1 : 2);
    if (state === 'Playing') {
      await expect.poll(async () => Math.abs(
        await host.evaluate(() => window.videoPlayer.getCurrentTime()) - await guest.evaluate(() => window.videoPlayer.getCurrentTime()),
      )).toBeLessThan(0.8);
      expect(await guest.evaluate(() => window.videoPlayer.getCurrentTime())).toBeGreaterThan(45);
    } else {
      const frozenPosition = (await roomState(host, roomId)).currentPositionSeconds;
      await expect.poll(() => guest.evaluate(() => window.videoPlayer.getCurrentTime())).toBeCloseTo(frozenPosition, 3);
      expect((await roomState(host, roomId)).playbackState).toBe(state);
    }
  });
}

test.describe('delayed player readiness', () => {
  test.use({ holdGuestPlayerReady: true });

  test('a late guest catches up after the player becomes ready', async ({ roomPages, request }) => {
    const { host, guest } = roomPages;
    const roomId = await prepareHost(host, request, 'Playing');
    await join(guest, roomId);
    expect(await guest.evaluate(() => window.videoPlayer.videoReady)).toBe(false);
    expect(await guest.evaluate(() => window.videoPlayer.getPlayerState())).toBe(-1);
    const joinedAt = await host.evaluate(() => window.videoPlayer.getCurrentTime());
    await expect.poll(() => host.evaluate(() => window.videoPlayer.getCurrentTime())).toBeGreaterThan(joinedAt + 2);
    await guest.evaluate(() => window.HARNESS_RELEASE_PLAYER_READY());
    await expect.poll(() => guest.evaluate(() => window.videoPlayer.getPlayerState())).toBe(1);
    await expect.poll(async () => Math.abs(
      await host.evaluate(() => window.videoPlayer.getCurrentTime()) - await guest.evaluate(() => window.videoPlayer.getCurrentTime()),
    )).toBeLessThan(0.8);
  });
});

test.describe('delayed video readiness', () => {
  test.use({ holdGuestVideoReady: true });

  test('a late guest waits for the loaded video and then catches up', async ({ roomPages, request }) => {
    const { host, guest } = roomPages;
    const roomId = await prepareHost(host, request, 'Playing');
    await join(guest, roomId);
    expect(await guest.evaluate(() => window.videoPlayer.videoReady)).toBe(false);
    expect(await guest.evaluate(() => window.videoPlayer.getPlayerState())).toBe(-1);
    const joinedAt = await host.evaluate(() => window.videoPlayer.getCurrentTime());
    await expect.poll(() => host.evaluate(() => window.videoPlayer.getCurrentTime())).toBeGreaterThan(joinedAt + 2);
    await guest.evaluate(() => window.HARNESS_RELEASE_VIDEO_READY());
    await expect.poll(() => guest.evaluate(() => window.videoPlayer.getPlayerState())).toBe(1);
    await expect.poll(async () => Math.abs(
      await host.evaluate(() => window.videoPlayer.getCurrentTime()) - await guest.evaluate(() => window.videoPlayer.getCurrentTime()),
    )).toBeLessThan(0.8);
  });
});
