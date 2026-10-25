import { Platform } from 'react-native';

const MapView = Platform.OS !== 'web' ? require('react-native-maps').default : () => null;
const { Marker, Polyline, PROVIDER_GOOGLE } = Platform.OS !== 'web' ? require('react-native-maps') : { Marker: () => null, Polyline: () => null, PROVIDER_GOOGLE: 'google' };

export { Marker, Polyline, PROVIDER_GOOGLE };
export default MapView;
