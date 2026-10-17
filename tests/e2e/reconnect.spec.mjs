import { test, expect, enterRoom, roomState } from './fixtures.mjs';

test.use({ interceptHostSocket: true });

test('a network interruption restores membership, host role and current playback', async ({ roomPages }) => {
  const { host, guest, interruptHostConnection } = roomPages;
  const roomId = await enterRoom(host, guest);
  await host.locator('#videoUrlInput').fill('https://www.youtube.com/watch?v=M7lc1UVf-VE');
  await host.locator('#btn-change-video').click();
  await host.waitForFunction(() => !window.syncMachine.isProcessingRemoteEvent && window.videoPlayer.videoReady);
  await host.locator('#customPlayBtn').click();
  await expect.poll(() => guest.evaluate(() => window.videoPlayer.getPlayerState())).toBe(1);
  const originalConnection = await host.evaluate(() => window.connection.connectionId);
  await host.context().setOffline(true);
  try {
    await interruptHostConnection();
    await host.waitForFunction(() => window.connection.state === 'Reconnecting', undefined, { timeout: 10000 });
    await expect(host.locator('#status')).toBeVisible();
    await expect(host.locator('#status')).toContainText('Reconnecting');
    expect((await roomState(guest, roomId)).participants.filter(p => p.isHost)).toHaveLength(1);
  } finally { await host.context().setOffline(false); }
  await expect.poll(() => host.evaluate(() => window.connection.state), { timeout: 20000 }).toBe('Connected');
  await expect.poll(() => host.evaluate(() => window.connection.connectionId)).not.toBe(originalConnection);
  await expect(host.locator('#hostControlsPanel')).toBeVisible();
  await expect(host.locator('#participant-count')).toHaveText('👥 2 participants');
  await expect(host.locator('#status')).toBeHidden();
  await expect.poll(() => host.evaluate(() => window.videoPlayer.getPlayerState())).toBe(1);
  await expect.poll(async () => Math.abs(await host.evaluate(() => window.videoPlayer.getCurrentTime()) -
    await guest.evaluate(() => window.videoPlayer.getCurrentTime()))).toBeLessThan(0.8);
  await host.locator('#customPauseBtn').click();
  await expect.poll(() => guest.evaluate(() => window.videoPlayer.getPlayerState())).toBe(2);
  expect((await roomState(guest, roomId)).participants).toHaveLength(2);
});
