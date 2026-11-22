import { test, expect, enterRoom } from './fixtures.mjs';

async function capture(page, testInfo, name) {
  const file = testInfo.outputPath(`${name}.png`);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}

async function expectNoHorizontalOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 740 },
]) {
  test(`home, keyboard theme selection and join form work at ${viewport.width}px`, async ({ roomPages }, testInfo) => {
    const { host } = roomPages;
    await host.setViewportSize(viewport);
    await expect(host.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(host);
    await capture(host, testInfo, `home-${viewport.width}`);

    const about = host.getByRole('button', { name: 'Made by Boris' });
    await about.click();
    await expect(about).toHaveAttribute('aria-expanded', 'true');
    await expect(host.getByRole('link', { name: 'GitHub' })).toBeVisible();
    await about.click();
    await expect(about).toHaveAttribute('aria-expanded', 'false');

    await host.locator('#btn-menu-create').press('Enter');
    await expect(host.locator('#settings-heading')).toBeFocused();
    await host.getByLabel('Your name', { exact: true }).fill('Boris');
    await host.getByLabel('Room name', { exact: true }).fill('The Friday night club');
    const warm = host.getByRole('button', { name: 'Golden hour' });
    await warm.press('Space');
    await expect(warm).toHaveAttribute('aria-pressed', 'true');
    await expectNoHorizontalOverflow(host);
    await capture(host, testInfo, `create-warm-${viewport.width}`);
    const rose = host.getByRole('button', { name: 'Rose club' });
    await rose.press('Enter');
    await expect(rose).toHaveAttribute('aria-pressed', 'true');
    await expect(warm).toHaveAttribute('aria-pressed', 'false');
    await capture(host, testInfo, `create-rose-${viewport.width}`);
    await host.getByRole('button', { name: 'Night arcade' }).press('Enter');
    await capture(host, testInfo, `create-dark-${viewport.width}`);
    await host.locator('#btn-settings-back').click();
    await expect(host.locator('#btn-menu-create')).toBeFocused();

    await host.locator('#btn-menu-join').click();
    await expect(host.getByLabel('Room code', { exact: true })).toBeVisible();
    await expect(host.getByLabel('Room name', { exact: true })).toBeHidden();
    await expect(host.getByRole('group', { name: 'Set the mood' })).toBeHidden();
    await expect(host.locator('#btn-settings-confirm')).toHaveText('Join Room');
    await expectNoHorizontalOverflow(host);
    await capture(host, testInfo, `join-${viewport.width}`);
  });
}

test('reduced motion keeps navigation usable without ongoing decorative animations', async ({ roomPages }) => {
  const { host } = roomPages;
  await host.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => host.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length)).toBe(0);
  await host.locator('#btn-menu-create').press('Enter');
  await expect(host.locator('#settings-heading')).toBeFocused();
  await expect(host.locator('#btn-settings-confirm')).toBeVisible();
  await expect.poll(() => host.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length)).toBe(0);
});

test('empty room, copy ID and fullscreen keyboard volume remain usable', async ({ roomPages }, testInfo) => {
  const { host, guest } = roomPages;
  await host.setViewportSize({ width: 1440, height: 1000 });
  const roomId = await enterRoom(host, guest);
  await expect(host.locator('#playerEmptyState')).toBeVisible();
  await expect(guest.locator('#playerEmptyState')).toBeVisible();
  await expect(guest.locator('#emptyStateDescription')).toContainText('Your host');
  await expectNoHorizontalOverflow(host);
  await capture(host, testInfo, 'room-empty-desktop');
  await host.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await host.locator('#btn-copy-id').click();
  const code = await host.locator('#room-id-value').textContent();
  await expect.poll(() => host.evaluate(() => navigator.clipboard.readText())).toBe(code);

  await host.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(host);
  await capture(host, testInfo, 'room-empty-mobile');
  await host.locator('#videoUrlInput').fill('https://www.youtube.com/watch?v=M7lc1UVf-VE');
  await host.locator('#btn-change-video').click();
  await expect(host.locator('#playerEmptyState')).toBeHidden();
  await expect(guest.locator('#playerEmptyState')).toBeHidden();
  await expect(host.locator('#theaterContainer')).toBeVisible();
  await host.waitForFunction(() => window.videoPlayer.videoReady);
  await expect(host.locator('#customTimeLabel')).not.toHaveText('00:00 / 00:00');
  await expectNoHorizontalOverflow(host);
  await capture(host, testInfo, 'room-player-mobile');

  await host.setViewportSize({ width: 1440, height: 1000 });
  await capture(host, testInfo, 'room-player-desktop');
  await host.locator('#customFullscreenBtn').click();
  await expect.poll(() => host.evaluate(() => document.fullscreenElement?.id)).toBe('theaterContainer');
  const volume = host.getByLabel('Movie volume', { exact: true });
  await volume.focus();
  await volume.press('Home');
  await expect(host.locator('#customVolumeValue')).toHaveText('0%');
  // Wait beyond the 3-second auto-hide threshold: keyboard focus must preserve controls.
  await host.waitForTimeout(3300);
  await expect(host.locator('.custom-controls-panel')).toBeVisible();
  await volume.press('End');
  await expect(host.locator('#customVolumeValue')).toHaveText('100%');
  await host.locator('#customFullscreenBtn').click();
  await host.locator('#btn-leave-room').click();
  await expect(host.locator('#main-menu')).toBeVisible();
});
