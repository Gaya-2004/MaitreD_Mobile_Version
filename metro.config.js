const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Limit maxWorkers to 2 to prevent memory crashes (OOM / Zone Allocation failed)
// on multi-core development environments with limited free memory.
config.maxWorkers = 2;

const path = require('path');

// Resolve shims and web fallbacks
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native-background-timer') {
    return {
      filePath: path.resolve(__dirname, 'src/utils/backgroundTimerShim.js'),
      type: 'sourceFile',
    };
  }
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return context.resolveRequest(context, '@teovilla/react-native-web-maps', platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
