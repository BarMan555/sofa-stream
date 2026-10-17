import { test, expect, enterRoom } from './fixtures.mjs';

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`open chat leaves room controls accessible at ${viewport.width}px`, async ({ roomPages }, testInfo) => {
    const { host, guest } = roomPages;
    await host.setViewportSize(viewport);
    await enterRoom(host, guest, { chatOpen: true });
    await expect(host.locator('#videoChatOverlay')).toBeVisible();
    await host.locator('#btn-leave-room').click({ trial: true, timeout: 2500 });
    await host.locator('#videoUrlInput').fill('https://www.youtube.com/watch?v=M7lc1UVf-VE');
    await host.locator('#btn-change-video').click({ timeout: 2500 });
    await host.waitForFunction(() => window.videoPlayer.videoReady && !window.syncMachine.isProcessingRemoteEvent);
    await host.locator('#customPlayBtn').click({ timeout: 2500 });
    await expect.poll(() => guest.evaluate(() => window.videoPlayer.getPlayerState())).toBe(1);
    await host.locator('#customPauseBtn').click({ timeout: 2500 });
    await expect.poll(() => guest.evaluate(() => window.videoPlayer.getPlayerState())).toBe(2);
    await host.locator('#customProgressBar').click({ trial: true, timeout: 2500 });
    await host.getByLabel('Movie volume').click({ trial: true, timeout: 2500 });
    expect(await host.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const screenshot = testInfo.outputPath(`chat-${viewport.width}.png`);
    await host.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach('room-chat-layout', { path: screenshot, contentType: 'image/png' });
    await host.locator('#btnToggleCollapse').click();
    await expect(host.locator('#videoChatOverlay')).toBeHidden();
    await host.locator('#videoChatRestoreBtn').click();
    await expect(host.locator('#videoChatOverlay')).toBeVisible();
    await host.locator('#btn-leave-room').click({ timeout: 2500 });
    await expect(host.locator('#main-menu')).toBeVisible();
    await expect(guest.locator('#hostControlsPanel')).toBeVisible();
  });
}

test('fullscreen dragging preserves player controls and exiting returns chat to its dock', async ({ roomPages }, testInfo) => {
  const { host, guest } = roomPages;
  await enterRoom(host, guest, { chatOpen: false });
  await host.locator('#videoUrlInput').fill('https://www.youtube.com/watch?v=M7lc1UVf-VE');
  await host.locator('#btn-change-video').click();
  await host.waitForFunction(() => window.videoPlayer.videoReady && !window.syncMachine.isProcessingRemoteEvent);
  await host.locator('#customPlayBtn').click();
  await expect.poll(() => host.evaluate(() => window.videoPlayer.getPlayerState())).toBe(1);
  await host.locator('#videoChatRestoreBtn').click();
  await host.locator('#customFullscreenBtn').click();
  await expect.poll(() => host.evaluate(() => document.fullscreenElement?.id)).toBe('theaterContainer');
  const header = await host.locator('#videoChatHeader').boundingBox();
  const size = host.viewportSize();
  await host.mouse.move(header.x + 30, header.y + 15);
  await host.mouse.down();
  await host.mouse.move(50, size.height - 30, { steps: 8 });
  await host.mouse.up();
  await host.locator('#customPauseBtn').click({ timeout: 2500 });
  await host.getByLabel('Movie volume').click({ trial: true, timeout: 2500 });
  await expect.poll(() => guest.evaluate(() => window.videoPlayer.getPlayerState())).toBe(2);
  const screenshot = testInfo.outputPath('chat-fullscreen.png');
  await host.screenshot({ path: screenshot });
  await testInfo.attach('fullscreen-chat-layout', { path: screenshot, contentType: 'image/png' });
  await host.locator('#customFullscreenBtn').click({ timeout: 2500 });
  await expect.poll(() => host.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await expect.poll(() => host.locator('#videoChatOverlay').evaluate(element => element.parentElement.id)).toBe('videoChatDock');
});
