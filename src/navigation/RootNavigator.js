import React, { useCallback, useEffect, useRef } from 'react';
import { Linking, Text } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import TripsScreen from '../screens/TripsScreen';
import TripParticipantsScreen from '../screens/TripParticipantsScreen';
import TripCostsScreen from '../screens/TripCostsScreen';
import TripResultsScreen from '../screens/TripResultsScreen';
import TripStatsScreen from '../screens/TripStatsScreen';
import TripShareScreen from '../screens/TripShareScreen';
import GroupsScreen from '../screens/GroupsScreen';
import GroupDetailScreen from '../screens/GroupDetailScreen';

import { useSettings } from '../context/SettingsContext';
import { useLanguage } from '../context/LanguageContext';
import { extractCode } from '../logic/codes';

const Tab = createBottomTabNavigator();
const TripsStack = createNativeStackNavigator();
const GroupsStack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

// Stable internal route keys — never localized — so tab identity, the
// default landing tab, and icon lookup all stay correct regardless of
// which language is displayed.
const TAB_ICONS = {
  Groups: '👨‍👩‍👧‍👦',
  Trips: '🧳',
};

function TabIcon({ routeName, focused }) {
  return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{TAB_ICONS[routeName]}</Text>;
}

function TripsStackNavigator() {
  return (
    <TripsStack.Navigator screenOptions={{ headerShown: false }}>
      <TripsStack.Screen name="TripsList" component={TripsScreen} />
      <TripsStack.Screen name="TripParticipants" component={TripParticipantsScreen} />
      <TripsStack.Screen name="TripCosts" component={TripCostsScreen} />
      <TripsStack.Screen name="TripResults" component={TripResultsScreen} />
      <TripsStack.Screen name="TripStats" component={TripStatsScreen} />
      <TripsStack.Screen name="TripShare" component={TripShareScreen} />
    </TripsStack.Navigator>
  );
}

function GroupsStackNavigator() {
  return (
    <GroupsStack.Navigator screenOptions={{ headerShown: false }}>
      <GroupsStack.Screen name="GroupsList" component={GroupsScreen} />
      <GroupsStack.Screen name="GroupDetail" component={GroupDetailScreen} />
    </GroupsStack.Navigator>
  );
}

export default function RootNavigator() {
  const { t } = useLanguage();
  const { colors, isDark } = useSettings();
  const pendingCode = useRef(null);

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme : DefaultTheme).colors,
      primary: colors.primary,
      background: colors.screenBg,
      card: colors.cardBg,
      text: colors.text,
      border: colors.border,
    },
  };

  // qatta://join/<code> (opened from the invitation page) or a link tapped while the app is running
  const openJoin = useCallback((url) => {
    const code = extractCode(url || '');
    if (!code) return;
    if (navigationRef.isReady()) {
      navigationRef.navigate('Trips', { screen: 'TripsList', params: { joinCode: code, joinNonce: Date.now() } });
    } else {
      pendingCode.current = url;
    }
  }, []);

  useEffect(() => {
    Linking.getInitialURL().then((u) => u && openJoin(u)).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => openJoin(url));
    return () => sub.remove();
  }, [openJoin]);

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navTheme}
      onReady={() => {
        if (pendingCode.current) {
          const u = pendingCode.current;
          pendingCode.current = null;
          openJoin(u);
        }
      }}
    >
      {/* initialRouteName keeps Trips as the screen shown on launch regardless
          of the physical left/right tab order below or the active language. */}
      <Tab.Navigator
        initialRouteName="Trips"
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.tabInactive,
          tabBarStyle: { backgroundColor: colors.cardBg, borderTopColor: colors.border },
          tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
          tabBarIcon: ({ focused }) => <TabIcon routeName={route.name} focused={focused} />,
        })}
      >
        {/* Declared in this order so Trips renders on the right side of the
            tab bar (the app does not mirror the layout engine for English). */}
        <Tab.Screen name="Groups" component={GroupsStackNavigator} options={{ tabBarLabel: t('tabs.groups') }} />
        <Tab.Screen name="Trips" component={TripsStackNavigator} options={{ tabBarLabel: t('tabs.trips') }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
