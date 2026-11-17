import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Chip from './Chip';
import Input from './Input';
import { CURRENCIES, isKnownCurrency, sanitizeCustomCurrency, MAX_CUSTOM_CURRENCY_LENGTH } from '../logic/currencies';
import { useLanguage } from '../context/LanguageContext';

// value: currency code or a custom symbol; onChange(newValue)
export default function CurrencyPicker({ value, onChange }) {
  const { language, isRTL, t } = useLanguage();
  const custom = !isKnownCurrency(value);
  const [customOpen, setCustomOpen] = useState(custom);
  const rowDir = { flexDirection: isRTL ? 'row-reverse' : 'row' };

  return (
    <View>
      <View style={[styles.row, rowDir]}>
        {CURRENCIES.map((c) => (
          <Chip
            key={c.code}
            label={language === 'ar' ? c.ar : `${c.code} · ${c.en}`}
            selected={!customOpen && value === c.code}
            onPress={() => {
              setCustomOpen(false);
              onChange(c.code);
            }}
          />
        ))}
        <Chip label={t('settings.customCurrency')} selected={customOpen} onPress={() => setCustomOpen(true)} />
      </View>
      {customOpen ? (
        <Input
          value={custom ? value : ''}
          placeholder={t('settings.customCurrencyPlaceholder')}
          maxLength={MAX_CUSTOM_CURRENCY_LENGTH}
          autoCapitalize="characters"
          onChangeText={(txt) => {
            const v = sanitizeCustomCurrency(txt);
            if (v) onChange(v);
          }}
          containerStyle={{ marginTop: 10, marginBottom: 0 }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexWrap: 'wrap', gap: 8 } });
