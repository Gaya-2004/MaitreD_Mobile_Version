/**
 * Modern, crisp Light Theme map style for Google Maps.
 * Ensures the map always displays in clear daytime light mode,
 * even when the customer's device has System Dark Mode enabled.
 */
export const LIGHT_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#f8f9fa" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "on" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#3c4043" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#dadce0" }] },
  { featureType: "administrative.land_parcel", elementType: "labels.text.fill", stylers: [{ color: "#70757a" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f1f3f4" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#e8eaed" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#5f6368" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#ceead6" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#188038" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "labels.text.fill", stylers: [{ color: "#3c4043" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#fdd663" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#f9ab00" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#202124" }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#5f6368" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#e8eaed" }] },
  { featureType: "transit.station", elementType: "geometry", stylers: [{ color: "#dadce0" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#aecbfa" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#1a73e8" }] }
];
