export const MUGALIVAKKAM_LOCATION = {
  latitude: 13.0210,
  longitude: 80.1614,
};

export const MGR_NAGAR_LOCATION = {
  latitude: 13.0350,
  longitude: 80.1970,
};

export const BANGLORE_LOCATION = {
  latitude: 12.8399,
  longitude: 77.6770,
};

export interface OutletLocation {
  name: string;
  latitude: number;
  longitude: number;
  restaurant_id?: number;
}

export const KNOWN_OUTLET_LOCATIONS: Record<string | number, OutletLocation> = {
  1: { name: 'Data Udipi — Mugalivakkam', latitude: 13.0210, longitude: 80.1614, restaurant_id: 1 },
  2: { name: 'Data Udipi — MGR Nagar', latitude: 13.0350, longitude: 80.1970, restaurant_id: 2 },
  3: { name: 'Data Udipi - Banglore', latitude: 12.8399, longitude: 77.6770, restaurant_id: 25 },
  25: { name: 'Data Udipi - Banglore', latitude: 12.8399, longitude: 77.6770, restaurant_id: 25 },
  mugalivakkam: { name: 'Data Udipi — Mugalivakkam', latitude: 13.0210, longitude: 80.1614, restaurant_id: 1 },
  mgrnagar: { name: 'Data Udipi — MGR Nagar', latitude: 13.0350, longitude: 80.1970, restaurant_id: 2 },
  banglore: { name: 'Data Udipi - Banglore', latitude: 12.8399, longitude: 77.6770, restaurant_id: 25 },
};

export const ALL_BRANCHES: OutletLocation[] = [
  KNOWN_OUTLET_LOCATIONS[1],
  KNOWN_OUTLET_LOCATIONS[2],
  KNOWN_OUTLET_LOCATIONS[25],
];

// Delivery radius expanded to support delivery beyond 5 km with incremental fee
export const DELIVERY_RADIUS_KM = 20;

export function resolveOutletLocation(outlet?: any): OutletLocation {
  if (outlet) {
    const lat = Number(outlet.lat ?? outlet.latitude);
    const lng = Number(outlet.lng ?? outlet.longitude);
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
      return {
        name: outlet.name || 'Data Udipi',
        latitude: lat,
        longitude: lng,
        restaurant_id: outlet.restaurant_id ? Number(outlet.restaurant_id) : (outlet.id ? Number(outlet.id) : undefined),
      };
    }

    const restId = outlet.restaurant_id ?? outlet.id;
    if (restId != null && KNOWN_OUTLET_LOCATIONS[restId]) {
      return KNOWN_OUTLET_LOCATIONS[restId];
    }

    const nameLower = (outlet.name || '').toLowerCase();
    if (nameLower.includes('mgr')) return KNOWN_OUTLET_LOCATIONS['mgrnagar'];
    if (nameLower.includes('bang') || nameLower.includes('beng')) return KNOWN_OUTLET_LOCATIONS['banglore'];
    if (nameLower.includes('muga')) return KNOWN_OUTLET_LOCATIONS['mugalivakkam'];
  }
  return KNOWN_OUTLET_LOCATIONS[1];
}

export function getDistanceInKm(
  latitude: number,
  longitude: number,
  origin: { latitude: number; longitude: number } = MUGALIVAKKAM_LOCATION,
): number {
  if (latitude == null || longitude == null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return Infinity;
  }
  const earthRadiusKm = 6371;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(latitude - origin.latitude);
  const longitudeDelta = toRadians(longitude - origin.longitude);
  const originLatitude = toRadians(origin.latitude);
  const targetLatitude = toRadians(latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.sin(longitudeDelta / 2) ** 2 * Math.cos(originLatitude) * Math.cos(targetLatitude);

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
}

/**
 * Validates whether coordinates are within the strict 5 km radius of the selected outlet.
 */
export function isWithinDeliveryArea(
  latitude?: number,
  longitude?: number,
  outlet?: any,
): boolean {
  if (latitude == null || longitude == null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return false;
  }
  const resolvedOutlet = resolveOutletLocation(outlet);
  return getDistanceInKm(latitude, longitude, resolvedOutlet) <= DELIVERY_RADIUS_KM;
}

export interface DeliveryCoverageResult {
  isEligible: boolean;
  distanceKm: number;
  maxRadiusKm: number;
  outletName: string;
  alternateBranch?: {
    name: string;
    distanceKm: number;
    restaurant_id?: number;
    isEligible: boolean;
  } | null;
  title: string;
  message: string;
}

/**
 * Comprehensive coverage check returning distance, eligibility, and nearby branch recommendation.
 */
export function checkDeliveryCoverage(
  latitude?: number,
  longitude?: number,
  outlet?: any,
): DeliveryCoverageResult {
  const maxRadiusKm = DELIVERY_RADIUS_KM;

  if (latitude == null || longitude == null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return {
      isEligible: false,
      distanceKm: 0,
      maxRadiusKm,
      outletName: 'Data Udipi',
      alternateBranch: null,
      title: 'Location Required',
      message: 'Please pin or select your precise delivery address on the map to confirm coverage.',
    };
  }

  const currentOutlet = resolveOutletLocation(outlet);
  const currentDistance = getDistanceInKm(latitude, longitude, currentOutlet);
  const isEligible = currentDistance <= maxRadiusKm;
  const formattedDistance = Number(currentDistance.toFixed(1));

  // Find if another Chennai branch is closer or within range
  let alternateBranch: DeliveryCoverageResult['alternateBranch'] = null;
  const otherBranches = ALL_BRANCHES.filter(
    b => b.name !== currentOutlet.name && b.restaurant_id !== currentOutlet.restaurant_id && b.restaurant_id !== 25
  );

  for (const branch of otherBranches) {
    const dist = getDistanceInKm(latitude, longitude, branch);
    if (dist <= maxRadiusKm) {
      alternateBranch = {
        name: branch.name,
        distanceKm: Number(dist.toFixed(1)),
        restaurant_id: branch.restaurant_id,
        isEligible: true,
      };
      break;
    }
  }

  let message = '';
  if (isEligible) {
    message = `Your address is within delivery range (${formattedDistance} km from ${currentOutlet.name}).`;
  } else {
    message = `Your address is ${formattedDistance} km away from ${currentOutlet.name}. We deliver strictly within ${maxRadiusKm} km to ensure hot, fresh meals and quick rider dispatch.`;
    if (alternateBranch && alternateBranch.isEligible) {
      message += ` However, ${alternateBranch.name} is only ${alternateBranch.distanceKm} km away and can deliver to you!`;
    }
  }

  return {
    isEligible,
    distanceKm: formattedDistance,
    maxRadiusKm,
    outletName: currentOutlet.name,
    alternateBranch,
    title: isEligible ? 'Within Delivery Range' : 'Restaurant Not Nearby',
    message,
  };
}

export const DELIVERY_FEE_RATE_TEXT = '₹100 flat for first 5 km + ₹20/km thereafter';

/**
 * Calculates delivery fee based on distance:
 * - ₹100 flat for the first 5 km (or base flat rate if distance <= 5 km)
 * - ₹20/km thereon for each additional km beyond 5 km
 */
export function calculateDeliveryFee(distanceKm?: number | null): number {
  if (distanceKm == null || isNaN(distanceKm) || distanceKm <= 0) {
    return 100;
  }
  if (distanceKm <= 5) {
    return 100;
  }
  const extraKm = distanceKm - 5;
  return Math.round(100 + extraKm * 20);
}
