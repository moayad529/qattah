// Address of the Qatta rooms server (deployed on Railway — see ROOMS_SERVER_GUIDE.md).
// After deploying, replace the placeholder below with your Railway public URL,
// e.g. 'https://qatta-rooms-production.up.railway.app' (no trailing slash).
// While it still contains "YOUR-APP", all room / sharing features stay hidden
// and the app works exactly as before (fully local).
export const ROOMS_API_URL = (
  process.env.EXPO_PUBLIC_ROOMS_API_URL || 'https://qattah-production.up.railway.app'
).replace(/\/+$/, '');

export const roomsEnabled = !ROOMS_API_URL.includes('YOUR-APP');

export const APP_SCHEME = 'qatta';
export const WEBSITE_URL = 'https://sbaqkm.com/our-apps.html';
// Public URL of your hosted privacy policy page (the same one you gave App Store Connect /
// Google Play). Leave empty to hide the button in Settings.
export const PRIVACY_URL = '';
