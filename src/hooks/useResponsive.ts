import { useWindowDimensions, PixelRatio, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Standard mobile baseline dimensions (iPhone 14 / modern standard device: 390 x 844)
const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;

export type PhoneModelCategory = 'compact' | 'standard' | 'plus' | 'tablet';

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // On wide screens (like desktop web), cap the effective mobile container width to 480
  const isTablet = width > 500;
  const effectiveWidth = isTablet ? 480 : width;
  const effectiveHeight = height;

  // Phone model categorization:
  // - compact: width < 375 or height < 720 (iPhone SE 1st/2nd/3rd gen, iPhone mini, older Androids)
  // - standard: 375 <= width <= 414 (iPhone 12/13/14/15/16, Samsung Galaxy S21/S22/S23/S24, Pixel)
  // - plus: width > 414 and <= 500 (iPhone Plus / Pro Max, Samsung Galaxy Ultra)
  // - tablet: width > 500 (iPads, Android tablets, desktop web view)
  const isSmallDevice = effectiveWidth < 375 || effectiveHeight < 720;
  const isStandardDevice = !isSmallDevice && effectiveWidth <= 414;
  const isLargeDevice = !isSmallDevice && !isStandardDevice && !isTablet;

  const phoneModel: PhoneModelCategory = isTablet
    ? 'tablet'
    : isLargeDevice
    ? 'plus'
    : isSmallDevice
    ? 'compact'
    : 'standard';

  // Responsive scaling calculations
  const scale = (size: number) => {
    const ratio = effectiveWidth / BASE_WIDTH;
    return Math.round(size * ratio);
  };

  const verticalScale = (size: number) => {
    const ratio = effectiveHeight / BASE_HEIGHT;
    return Math.round(size * ratio);
  };

  // Moderate scaling applies damping (default factor 0.5) so fonts and paddings scale gracefully
  const moderateScale = (size: number, factor = 0.5) => {
    const scaled = scale(size);
    return Math.round(size + (scaled - size) * factor);
  };

  // Safe bottom padding that handles phones with home indicator bar, notches, or 3-button nav
  const safeBottomPadding = Math.max(
    insets.bottom,
    Platform.OS === 'android' ? 16 : 8
  );

  // Safe top padding that accounts for dynamic islands, notches, and status bars
  const safeTopPadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? 24 : 16
  );

  return {
    width,
    height,
    effectiveWidth,
    effectiveHeight,
    isSmallDevice,
    isStandardDevice,
    isLargeDevice,
    isTablet,
    phoneModel,
    scale,
    verticalScale,
    moderateScale,
    insets,
    safeBottomPadding,
    safeTopPadding,
    pixelRatio: PixelRatio.get(),
  };
}

