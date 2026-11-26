import { test, expect, enterRoom } from './fixtures.mjs';

test.use({ controlledMicrophones: true });

async function captureChat(page, testInfo, name) {
  const file = testInfo.outputPath(`${name}.png`);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.locator('#videoChatOverlay').screenshot({ path: file, animations: 'disabled' });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}

const tracks = page => page.evaluate(() => localStream.getTracks().map(track => ({ id: track.id, state: track.readyState })));

for (const width of [1280, 390]) {
  test(`camera, microphone and call layout stay consistent for both participants at ${width}px`, async ({ roomPages }, testInfo) => {
    const { host, guest } = roomPages;
    await host.setViewportSize({ width, height: 900 });
    await enterRoom(host, guest);
    const guestId = await guest.evaluate(() => globalUserId);
    const remote = host.locator(`#slot-${guestId}`);
    await expect(remote).toHaveClass(/has-video/);
    await expect(remote.locator('.participant-name')).toHaveText('Guest');
    await expect(host.locator('#slot-local')).toHaveClass(/has-video/);
    await expect(host.locator('#chatParticipantCount')).toHaveText('2/4');
    await expect(host.locator('#videoGrid')).toHaveClass(/single-layout/);

    await guest.getByRole('button', { name: 'Camera', exact: true }).click();
    await expect(guest.getByRole('button', { name: 'Camera', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(remote.locator('.participant-camera-state')).toHaveText('Camera off');
    await expect(remote.locator('.participant-avatar')).toBeVisible();
    await expect(remote.locator('.participant-avatar')).toHaveText('G');
    await expect(guest.locator('#slot-local')).toHaveClass(/camera-off/);
    expect(await guest.evaluate(() => localStream.getVideoTracks()[0].enabled)).toBe(false);

    await guest.getByRole('button', { name: 'Microphone', exact: true }).press('Space');
    await expect(remote.locator('.mic-indicator')).toBeVisible();
    await expect(remote.locator('.mic-indicator')).toHaveAttribute('aria-label', 'Microphone off');
    expect(await guest.evaluate(() => localStream.getAudioTracks()[0].enabled)).toBe(false);
    await captureChat(host, testInfo, `chat-camera-off-${width}`);

    // Both directions must work; previously single-layout remained stuck on.
    const originalTracks = await tracks(host);
    await host.getByRole('button', { name: 'Show video grid', exact: true }).click();
    await expect(host.locator('#videoGrid')).not.toHaveClass(/single-layout/);
    await host.getByRole('button', { name: 'Show large videos', exact: true }).press('Enter');
    await expect(host.locator('#videoGrid')).toHaveClass(/single-layout/);
    await host.getByRole('button', { name: 'Hide video chat', exact: true }).press('Enter');
    await expect(host.locator('#videoChatOverlay')).toBeHidden();
    await expect(host.locator('#videoChatRestoreBtn')).toBeFocused();
    await expect(host.locator('#chatRestoreCount')).toHaveText('2/4');
    await host.locator('#videoChatRestoreBtn').press('Enter');
    await expect(host.locator('#btnToggleCollapse')).toBeFocused();
    expect(await tracks(host)).toEqual(originalTracks);

    await guest.getByRole('button', { name: 'Camera', exact: true }).click();
    await guest.getByRole('button', { name: 'Microphone', exact: true }).click();
    await expect(remote).not.toHaveClass(/camera-off|microphone-off/);
    await expect(remote.locator('.participant-avatar')).toBeHidden();
    await expect(guest.getByRole('button', { name: 'Camera', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await guest.evaluate(() => localStream.getTracks().every(track => track.enabled))).toBe(true);

    await guest.evaluate(() => { window.harnessMicrophone.gain.gain.value = 0.2; });
    await expect(remote).toHaveClass(/active-speaker/);
    await expect(remote.locator('.speaker-indicator')).toBeVisible();
    await captureChat(host, testInfo, `chat-speaking-${width}`);
    await guest.evaluate(() => { window.harnessMicrophone.gain.gain.value = 0; });
    await expect(remote).not.toHaveClass(/active-speaker/);
    expect(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('four participants fit in a grid and a selected layout survives departures', async ({ roomPages }, testInfo) => {
  const { host, guest } = roomPages;
  const room = await enterRoom(host, guest);
  const extra = [];
  const pageErrors = [];
  try {
    for (const name of ['Alex Kim', 'Sam Lee']) {
      const page = await guest.context().newPage();
      extra.push(page);
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.goto('/');
      await page.locator('#btn-menu-join').click();
      await page.locator('#userNameInput').fill(name);
      await page.locator('#roomIdInput').fill(room);
      await page.locator('#btn-settings-confirm').click();
      await expect(page.locator('#room-view')).toBeVisible();
      await page.getByRole('button', { name: 'Camera', exact: true }).click();
    }
    await expect(host.locator('#videoGrid .video-slot')).toHaveCount(4);
    await expect(host.locator('#chatParticipantCount')).toHaveText('4/4');
    await expect(host.locator('#videoGrid')).not.toHaveClass(/single-layout/);
    for (const name of ['Alex Kim', 'Sam Lee']) {
      const tile = host.getByRole('group', { name, exact: true });
      await expect(tile.locator('.participant-camera-state')).toHaveText('Camera off');
      await expect(tile.locator('.participant-avatar')).toBeVisible();
    }
    for (const theme of ['Dark', 'WarmHome', 'Princess']) {
      // Theme presentation only; membership and media continue on the real room.
      await host.evaluate(theme => applyRoomTheme(theme), theme);
      await captureChat(host, testInfo, `chat-four-${theme}`);
    }
    await host.setViewportSize({ width: 390, height: 844 });
    await captureChat(host, testInfo, 'chat-four-mobile');
    await host.getByRole('button', { name: 'Show large videos', exact: true }).click();
    await expect(host.locator('#videoGrid')).toHaveClass(/single-layout/);
    await host.getByRole('button', { name: 'Show video grid', exact: true }).click();
    await expect(host.locator('#videoGrid')).not.toHaveClass(/single-layout/);
    expect(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(pageErrors).toEqual([]);
  } finally {
    for (const page of extra) {
      if (await page.locator('#room-view').isVisible()) await page.locator('#btn-leave-room').click();
      await page.close();
    }
  }
  await expect(host.locator('#chatParticipantCount')).toHaveText('2/4');
  // Explicitly chosen grid persists even when the room becomes smaller.
  await expect(host.locator('#videoGrid')).not.toHaveClass(/single-layout/);
});

test('denied camera and microphone show an honest unavailable state without blocking the room', async ({ roomPages }, testInfo) => {
  const { host, guest } = roomPages;
  await host.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); };
  });
  await enterRoom(host, guest);
  await expect(host.locator('#chatMediaNotice')).toBeVisible();
  await expect(host.locator('#slot-local .participant-camera-state')).toHaveText('Camera unavailable');
  for (const name of ['Microphone', 'Camera']) {
    const button = host.getByRole('button', { name, exact: true });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
  }
  const hostId = await host.evaluate(() => globalUserId);
  await expect(guest.locator(`#slot-${hostId}`)).toHaveClass(/camera-off/);
  await expect(guest.locator(`#slot-${hostId} .participant-avatar`)).toHaveText('H');
  await captureChat(host, testInfo, 'chat-unavailable');
  await host.locator('#videoUrlInput').fill('https://www.youtube.com/watch?v=M7lc1UVf-VE');
  await host.locator('#btn-change-video').click();
  await expect(host.locator('#customPlayBtn')).toBeEnabled();
});
