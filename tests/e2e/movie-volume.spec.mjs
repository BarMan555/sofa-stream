import { test, expect, enterRoom, roomState } from './fixtures.mjs';

test.use({ controlledMicrophones: true });

async function chooseVolume(page, value) {
  await page.getByLabel('Movie volume').evaluate((slider, value) => {
    slider.value = String(value);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await expect(page.locator('#customVolumeValue')).toHaveText(`${value}%`);
}

const volume = page => page.evaluate(() => window.videoPlayer.ytPlayer.volume);

async function loadVideo(host) {
  await host.locator('#videoUrlInput').fill('https://www.youtube.com/watch?v=M7lc1UVf-VE');
  await host.locator('#btn-change-video').click();
  await expect(host.locator('#customPlayBtn')).toBeEnabled();
}

test('host and guest choose their own movie volume and a saved zero survives reload', async ({ roomPages }) => {
  const { host, guest } = roomPages;
  const room = await enterRoom(host, guest);
  const commands = [];
  for (const page of [host, guest]) page.on('request', request => {
    if (request.method() === 'POST' && /\/playback$/.test(new URL(request.url()).pathname)) commands.push(request.url());
  });
  await loadVideo(host);
  await chooseVolume(host, 60);
  await chooseVolume(guest, 35);
  await expect.poll(() => volume(host)).toBe(60);
  await expect.poll(() => volume(guest)).toBe(35);
  await chooseVolume(host, 0);
  await expect.poll(() => volume(host)).toBe(0);
  expect(await volume(guest)).toBe(35);
  expect(commands).toEqual([]);
  expect((await roomState(host, room)).playbackState).toBe('Paused');
  await host.reload();
  await expect(host.getByLabel('Movie volume')).toHaveValue('0');
  await expect(host.locator('#customVolumeValue')).toHaveText('0%');
});

test('speech sent through WebRTC ducks each chosen volume and mute restores it', async ({ roomPages }) => {
  const { host, guest } = roomPages;
  await enterRoom(host, guest);
  await loadVideo(host);
  await chooseVolume(host, 60);
  await chooseVolume(guest, 80);
  await host.locator('#customPlayBtn').click();
  for (const page of [host, guest]) {
    await expect.poll(() => page.evaluate(() => window.videoPlayer.getPlayerState())).toBe(1);
    await page.waitForFunction(() => Object.values(peerConnections).some(pc => pc.connectionState === 'connected'));
  }
  const guestId = await guest.evaluate(() => globalUserId);
  await guest.evaluate(() => { window.harnessMicrophone.gain.gain.value = 0.2; });
  await expect.poll(() => volume(host)).toBe(18);
  await expect.poll(() => volume(guest)).toBe(24);
  await expect(host.locator(`#slot-${guestId}`)).toHaveClass(/active-speaker/);
  await expect(host.locator('#duckingStatus')).toHaveText('Speech: 18%');
  await expect(guest.locator('#duckingStatus')).toBeVisible();
  await expect(host.getByLabel('Movie volume')).toHaveValue('60');

  await guest.locator('#btnToggleAudio').click();
  await expect.poll(() => volume(host)).toBe(60);
  await expect.poll(() => volume(guest)).toBe(80);
  await expect(host.locator('#duckingStatus')).toBeHidden();
  await guest.locator('#btnToggleAudio').click();
  await expect.poll(() => volume(host)).toBe(18);
  await chooseVolume(host, 40);
  await expect.poll(() => volume(host)).toBe(12);
  await guest.evaluate(() => { window.harnessMicrophone.gain.gain.value = 0; });
  await expect.poll(() => volume(host)).toBe(40);
  await expect.poll(() => volume(guest)).toBe(80);
  await expect(host.locator('#duckingStatus')).toBeHidden();
  await guest.locator('#btn-leave-room').click();
  expect(await volume(guest)).toBe(80);
});
