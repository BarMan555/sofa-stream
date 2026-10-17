import { test as base, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { redact } from '../../scripts/lib/runtime.mjs';

const signalr = fileURLToPath(new URL('../../node_modules/@microsoft/signalr/dist/browser/signalr.min.js', import.meta.url));
const player = fileURLToPath(new URL('./fake-youtube-api.js', import.meta.url));

export const test = base.extend({
  holdGuestPlayerReady: [false, { option: true }],
  holdGuestVideoReady: [false, { option: true }],
  holdGuestYoutubeApi: [false, { option: true }],
  failGuestYoutubeApi: [false, { option: true }],
  interceptHostSocket: [false, { option: true }],
  playerWarmup: [false, { option: true }],
  controlledMicrophones: [false, { option: true }],
  roomPages: async ({ browser, holdGuestPlayerReady, holdGuestVideoReady, holdGuestYoutubeApi, failGuestYoutubeApi, interceptHostSocket, playerWarmup, controlledMicrophones }, use, testInfo) => {
    const clients = [];
    const logs = [];
    const pageErrors = [];
    let hostSocket;
    let guestApiRoute;
    async function createClient(name) {
      const context = await browser.newContext({ permissions: ['camera', 'microphone'] });
      if (controlledMicrophones) await context.addInitScript(() => {
        const getMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async constraints => {
          const stream = await getMedia(constraints);
          if (!constraints.audio) return stream;
          const audio = new AudioContext();
          await audio.resume();
          const oscillator = audio.createOscillator();
          const gain = audio.createGain();
          const destination = audio.createMediaStreamDestination();
          gain.gain.value = 0;
          oscillator.connect(gain); gain.connect(destination); oscillator.start();
          for (const track of stream.getAudioTracks()) { stream.removeTrack(track); track.stop(); }
          stream.addTrack(destination.stream.getAudioTracks()[0]);
          // The application registers this stream and sends it over the real peer connection.
          window.harnessMicrophone = { audio, gain, oscillator };
          return stream;
        };
      });
      if (playerWarmup) await context.addInitScript(() => { window.HARNESS_BUFFER_ON_PLAY = true; });
      if (name === 'host' && interceptHostSocket) {
        await context.routeWebSocket(/\/hubs\/room(?:\?|$)/, client => {
          hostSocket = { client, server: client.connectToServer() };
        });
      }
      if (name === 'guest' && holdGuestPlayerReady)
        await context.addInitScript(() => { window.HARNESS_HOLD_PLAYER_READY = true; });
      if (name === 'guest' && holdGuestVideoReady)
        await context.addInitScript(() => { window.HARNESS_HOLD_VIDEO_READY = true; });
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      await context.route('https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/8.0.0/signalr.min.js',
        route => route.fulfill({ path: signalr, contentType: 'text/javascript' }));
      await context.route('https://www.youtube.com/iframe_api',
        route => {
          if (name === 'guest' && failGuestYoutubeApi) return route.abort('failed');
          if (name === 'guest' && holdGuestYoutubeApi) { guestApiRoute = route; return; }
          return route.fulfill({ path: player, contentType: 'text/javascript' });
        });
      await context.addInitScript(() => {
        // Room-flow tests use local peer candidates and synthetic Chromium media.
        const PeerConnection = window.RTCPeerConnection;
        window.RTCPeerConnection = class extends PeerConnection {
          constructor(configuration) { super({ ...configuration, iceServers: [] }); }
        };
      });
      const page = await context.newPage();
      page.on('console', message => logs.push({ client: name, type: message.type(), text: redact(message.text()), time: Date.now() }));
      page.on('pageerror', error => pageErrors.push({ client: name, message: error.message }));
      clients.push({ name, context, page });
      await page.goto(process.env.SOFASTREAM_FRONTEND_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => Boolean(window.videoPlayer && window.syncMachine), undefined, { timeout: 10000 });
      return page;
    }
    try {
      const host = await createClient('host');
      const guest = await createClient('guest');
      await use({ host, guest, async releaseGuestYoutubeApi() {
        expect(guestApiRoute, 'The guest API request must be pending').toBeTruthy();
        await guestApiRoute.fulfill({ path: player, contentType: 'text/javascript' });
        guestApiRoute = null;
      }, async interruptHostConnection() {
        expect(hostSocket, 'The host must have a routed connection to the real WebSocket server').toBeTruthy();
        await Promise.all([hostSocket.client.close({ code: 1011, reason: 'Harness transport interruption' }),
          hostSocket.server.close({ code: 1011 })]);
      } });
      expect(pageErrors, 'Unhandled browser exceptions').toEqual([]);
    } finally {
      await testInfo.attach('browser-console', { body: JSON.stringify({ logs, pageErrors }, null, 2), contentType: 'application/json' });
      const failed = testInfo.status !== testInfo.expectedStatus || pageErrors.length > 0;
      for (const { name, context, page } of clients) {
        if (failed) {
          if (!page.isClosed()) {
            try { await testInfo.attach(`${name}-screenshot`, { body: await page.screenshot({ fullPage: true, timeout: 2000 }), contentType: 'image/png' }); }
            catch { /* A closed browser must not replace the original failure. */ }
          }
          try {
            const trace = testInfo.outputPath(`${name}-trace.zip`);
            await context.tracing.stop({ path: trace });
            await testInfo.attach(`${name}-trace`, { path: trace, contentType: 'application/zip' });
          } catch { /* Console and the original assertion remain available. */ }
        } else await context.tracing.stop();
        await context.close();
      }
    }
  },
});

export { expect };

export async function enterRoom(host, guest, { chatOpen = true } = {}) {
  await host.locator('#btn-menu-create').click();
  await host.locator('#userNameInput').fill('Host');
  await host.locator('#roomNameInput').fill('Harness Movie Night');
  await host.locator('#btn-settings-confirm').click();
  await expect(host.locator('#room-view')).toBeVisible();
  const roomId = await host.locator('#room-id-value').textContent();
  expect(roomId).toMatch(/^[0-9a-f-]{36}$/i);
  await guest.locator('#btn-menu-join').click();
  await guest.locator('#userNameInput').fill('Guest');
  await guest.locator('#roomIdInput').fill(roomId);
  await guest.locator('#btn-settings-confirm').click();
  await expect(guest.locator('#room-view')).toBeVisible();
  await expect(host.locator('#participant-count')).toHaveText('👥 2 participants');
  await expect(guest.locator('#participant-count')).toHaveText('👥 2 participants');
  if (!chatOpen) {
    for (const page of [host, guest]) {
      await page.locator('#btnToggleCollapse').click();
      await expect(page.locator('#videoChatOverlay')).toBeHidden();
    }
  }
  return roomId;
}

export async function roomState(page, roomId) {
  return page.evaluate(async room => {
    const response = await window.apiFetch(`${API_BASE_URL}/api/room/${room}`);
    if (!response.ok) throw new Error(`Room state failed: ${response.status}`);
    return response.json();
  }, roomId);
}
