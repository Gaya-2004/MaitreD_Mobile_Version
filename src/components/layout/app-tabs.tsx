import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="index">
        {/* @ts-ignore - Expo NativeTabs types are incomplete */}
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        {/* @ts-ignore */}
        <NativeTabs.Trigger.Icon
          src={require('../../../assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="explore">
        {/* @ts-ignore */}
        <NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
        {/* @ts-ignore */}
        <NativeTabs.Trigger.Icon
          src={require('../../../assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
