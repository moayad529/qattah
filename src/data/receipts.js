import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { onExpensesRemoved } from './storage';

// Receipt photos live ONLY on this device (app documents folder). They are never
// uploaded — not even for shared trips. We store just the file *name*: the absolute
// documents path can change after an app update on iOS, so the full URI is rebuilt
// from FileSystem.documentDirectory every time.

const MAP_KEY = '@qatta/receipts';
const DIR = `${FileSystem.documentDirectory}receipts/`;

async function readMap() {
  try {
    const raw = await AsyncStorage.getItem(MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}
const writeMap = (m) => AsyncStorage.setItem(MAP_KEY, JSON.stringify(m));

export const receiptUri = (fileName) => (fileName ? DIR + fileName : null);

export async function getReceiptMap() {
  return readMap();
}

export async function saveReceipt(expenseId, sourceUri) {
  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
  const map = await readMap();
  const fileName = `${expenseId}-${Date.now().toString(36)}.jpg`;
  await FileSystem.copyAsync({ from: sourceUri, to: DIR + fileName });
  if (map[expenseId]) await FileSystem.deleteAsync(DIR + map[expenseId], { idempotent: true }).catch(() => {});
  map[expenseId] = fileName;
  await writeMap(map);
  return fileName;
}

export async function removeReceipt(expenseId) {
  const map = await readMap();
  if (!map[expenseId]) return;
  await FileSystem.deleteAsync(DIR + map[expenseId], { idempotent: true }).catch(() => {});
  delete map[expenseId];
  await writeMap(map);
}

// When expenses disappear (deleted, trip removed, synced away) their photos go too.
onExpensesRemoved(async (ids) => {
  for (const id of ids) await removeReceipt(id);
});
