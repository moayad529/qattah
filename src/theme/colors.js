// Theme palettes — match the Qatta logo identity (orange→red on cream) in light mode
// and a warm dark-brown version for dark mode.
export const lightColors = {
  primary: '#e8590c',
  primaryDark: '#c1272d',
  secondary: '#95a5a6',
  danger: '#e03131',
  dangerDark: '#a61e1e',
  success: '#2f9e44',
  successBg: '#d4edda',
  successText: '#155724',
  errorBg: '#f8d7da',
  errorText: '#721c24',
  info: '#3498db',
  infoBg: '#fdeee0',
  warning: '#f39c12',
  warningBg: '#fff3cd',
  warningText: '#7a5b00',
  text: '#2b2420',
  textMuted: '#6b5f52',
  textLight: '#a39a8c',
  border: '#e8ddc8',
  cardBg: '#ffffff',
  inputBg: '#ffffff',
  screenBg: '#FAF4E6',
  chipBg: '#FBF6EA',
  whatsapp: '#25d366',
  telegram: '#0088cc',
  twitter: '#1da1f2',
  purpleTint: '#FDF0E4',
  tabInactive: '#a0a0a0',
  placeholder: '#a0a0a0',
  overlay: 'rgba(0,0,0,0.5)',
};

export const darkColors = {
  ...lightColors,
  primary: '#ff7a2e',
  danger: '#ff6b6b',
  success: '#51cf66',
  successBg: '#1f3a28',
  successText: '#a7e3b5',
  errorBg: '#4a1f22',
  errorText: '#ffb3b8',
  info: '#5aa9e6',
  infoBg: '#3a2a1c',
  warningBg: '#3d3112',
  warningText: '#ffd666',
  text: '#f3ece0',
  textMuted: '#c2b5a2',
  textLight: '#8f8474',
  border: '#4a3f33',
  cardBg: '#241e18',
  inputBg: '#1c1713',
  screenBg: '#17130f',
  chipBg: '#2e261e',
  purpleTint: '#33261b',
  tabInactive: '#8f8474',
  placeholder: '#8f8474',
  overlay: 'rgba(0,0,0,0.7)',
};

// Kept for any legacy import; components should use useTheme().colors instead.
export const colors = lightColors;

export const gradient = ['#f7941d', '#c1272d'];
export const gradientDark = ['#b8610f', '#7d1a1f'];
