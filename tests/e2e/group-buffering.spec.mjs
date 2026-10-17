import { test, expect, enterRoom, roomState } from './fixtures.mjs';

async function startPlaying(host, guest) {
  const roomId = await enterRoom(host, guest);
  await host.locator('#videoUrlInput').fill('https://www.youtube.com/watch?v=M7lc1UVf-VE');
  await host.locator('#btn-change-video').click();
  await host.waitForFunction(() => window.videoPlayer.videoReady && !window.syncMachine.isProcessingRemoteEvent);
  await host.locator('#customPlayBtn').click();
  for (const page of [host, guest])
    await expect.poll(() => page.evaluate(() => window.videoPlayer.getPlayerState())).toBe(1);
  return roomId;
}

test('a buffering guest stops the room and native readiness resumes both participants', async ({ roomPages }) => {
  const { host, guest } = roomPages;
  const roomId = await startPlaying(host, guest);
  await guest.evaluate(() => window.videoPlayer.ytPlayer.setState(3));
  await expect.poll(async () => (await roomState(host, roomId)).playbackState).toBe('Buffering');
  await expect.poll(() => host.evaluate(() => window.videoPlayer.getPlayerState())).toBe(2);
  expect(await guest.evaluate(() => window.videoPlayer.getPlayerState())).toBe(3);
  await guest.evaluate(() => window.videoPlayer.ytPlayer.setState(1));
  for (const page of [host, guest])
    await expect.poll(() => page.evaluate(() => window.videoPlayer.getPlayerState())).toBe(1);
  expect((await roomState(host, roomId)).participants.every(p => !p.isBuffering)).toBe(true);
});

test('the room waits for both buffering participants and resumes when the last waiting guest leaves', async ({ roomPages }) => {
  const { host, guest } = roomPages;
  const roomId = await startPlaying(host, guest);
  await Promise.all([host, guest].map(page => page.evaluate(() => window.videoPlayer.ytPlayer.setState(3))));
  await expect.poll(async () => (await roomState(host, roomId)).participants.filter(p => p.isBuffering).length).toBe(2);
  await host.evaluate(() => window.videoPlayer.ytPlayer.setState(1));
  await expect.poll(async () => (await roomState(host, roomId)).participants.filter(p => p.isBuffering).length).toBe(1);
  expect((await roomState(host, roomId)).playbackState).toBe('Buffering');
  expect(await host.evaluate(() => window.videoPlayer.getPlayerState())).toBe(2);
  await guest.locator('#btn-leave-room').click();
  await expect(guest.locator('#main-menu')).toBeVisible();
  await expect.poll(() => host.evaluate(() => window.videoPlayer.getPlayerState())).toBe(1);
  expect((await roomState(host, roomId)).participants).toHaveLength(1);
});

test.describe('buffering participant reconnect', () => {
  test.use({ interceptHostSocket: true });
  test('returning host reloads the video and releases its old buffering wait', async ({ roomPages }) => {
    const { host, guest, interruptHostConnection } = roomPages;
    const roomId = await startPlaying(host, guest);
    await host.evaluate(() => window.videoPlayer.ytPlayer.setState(3));
    await expect.poll(async () => (await roomState(guest, roomId)).playbackState).toBe('Buffering');
    const oldConnection = await host.evaluate(() => window.connection.connectionId);
    await host.context().setOffline(true);
    try {
      await interruptHostConnection();
      await host.waitForFunction(() => window.connection.state === 'Reconnecting');
    } finally { await host.context().setOffline(false); }
    await expect.poll(() => host.evaluate(() => window.connection.connectionId)).not.toBe(oldConnection);
    for (const page of [host, guest])
      await expect.poll(() => page.evaluate(() => window.videoPlayer.getPlayerState())).toBe(1);
    const state = await roomState(guest, roomId);
    expect(state.playbackState).toBe('Playing');
    expect(state.participants).toHaveLength(2);
    expect(state.participants.every(p => !p.isBuffering)).toBe(true);
  });
});

test.describe('native warmup during commanded play', () => {
  test.use({ playerWarmup: true });
  test('brief player warmup does not cause a repeated room pause and play cycle', async ({ roomPages }) => {
    const { host, guest } = roomPages;
    let bufferingReports = 0;
    for (const page of [host, guest]) page.on('request', request => {
      if (request.method() === 'POST' && request.url().endsWith('/playback') && request.postDataJSON()?.requestedState === 2)
        bufferingReports++;
    });
    const room = await startPlaying(host, guest);
    await expect.poll(() => host.evaluate(() => window.videoPlayer.getCurrentTime())).toBeGreaterThan(2);
    expect(bufferingReports).toBe(0);
    expect((await roomState(host, room)).playbackState).toBe('Playing');
  });
});
