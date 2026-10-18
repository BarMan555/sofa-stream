import { test, expect, enterRoom, roomState } from './fixtures.mjs';

async function prepareJoin(page, code) {
  await page.locator('#btn-menu-join').click();
  await page.getByLabel('Your name', { exact: true }).fill('Guest');
  await page.getByLabel('Room code', { exact: true }).fill(code);
}

test('a copied readable code opens the same room in lowercase and the header fits narrow screens', async ({ roomPages }, testInfo) => {
  const { host, guest } = roomPages;
  const room = await enterRoom(host, guest);
  const code = await host.locator('#room-id-value').textContent();
  await expect(host.locator('.room-icon')).toHaveCount(0);
  await host.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const copy = host.getByRole('button', { name: 'Copy code', exact: true });
  await copy.click();
  await expect.poll(() => host.evaluate(() => navigator.clipboard.readText())).toBe(code);
  await expect(host.locator('#btn-copy-id .copy-label')).toHaveText('Copied');
  await expect(host.locator('#btn-copy-id svg')).toBeVisible();
  await expect(host.locator('#btn-copy-id .copy-label')).toHaveText('Copy code');

  await guest.locator('#btn-leave-room').click();
  await expect(host.locator('#participant-count')).toHaveText('1 participant');
  await prepareJoin(guest, code.toLowerCase().replace('-', ' '));
  await guest.locator('#btn-settings-confirm').click();
  await expect(guest.locator('#room-view')).toBeVisible();
  await expect(guest.locator('#room-id-value')).toHaveText(code);
  expect(await guest.evaluate(() => currentRoomId)).toBe(room);

  for (const width of [1280, 602, 320]) {
    await host.setViewportSize({ width, height: 900 });
    expect(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await host.locator('#btn-copy-id').click({ trial: true });
    await host.locator('#btn-leave-room').click({ trial: true });
    await host.mouse.move(0, 0);
    await host.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const file = testInfo.outputPath(`room-header-${width}.png`);
    await host.locator('.room-nav-header').screenshot({ path: file, animations: 'disabled' });
    await testInfo.attach(`room-header-${width}`, { path: file, contentType: 'image/png' });
  }
});

test('a mistyped code leaves the form usable and can be corrected without a new session', async ({ roomPages }) => {
  const { host, guest } = roomPages;
  await enterRoom(host, guest);
  const code = await host.locator('#room-id-value').textContent();
  await guest.locator('#btn-leave-room').click();
  const messages = [];
  guest.on('dialog', async dialog => { messages.push(dialog.message()); await dialog.accept(); });
  await prepareJoin(guest, 'O0-I1');
  await guest.locator('#btn-settings-confirm').click();
  await expect.poll(() => messages).toContain('Enter the 8-character room code.');
  await expect(guest.locator('#settings-form')).toBeVisible();
  await guest.getByLabel('Room code', { exact: true }).fill(code.replace('-', ''));
  await guest.locator('#btn-settings-confirm').click();
  await expect(guest.locator('#room-view')).toBeVisible();
  await expect(host.locator('#participant-count')).toHaveText('2 participants');
});

test('cancelling a delayed code admission removes the participant after its response arrives', async ({ roomPages }) => {
  const { host, guest } = roomPages;
  const room = await enterRoom(host, guest);
  const code = await host.locator('#room-id-value').textContent();
  await guest.locator('#btn-leave-room').click();
  let release;
  await guest.route('**/api/room/code/*/join', async route => {
    const response = await route.fetch();
    await new Promise(resolve => { release = resolve; });
    await route.fulfill({ response });
  });
  try {
    await prepareJoin(guest, code);
    await guest.locator('#btn-settings-confirm').click();
    await expect.poll(() => Boolean(release)).toBe(true);
    expect((await roomState(host, room)).participants).toHaveLength(2);
    await guest.evaluate(() => leaveRoom());
    release();
    await expect.poll(async () => (await roomState(host, room)).participants.length).toBe(1);
    await expect(guest.locator('#main-menu')).toBeVisible();
    expect(await guest.evaluate(() => currentRoomId)).toBeNull();
  } finally { release?.(); }
});
