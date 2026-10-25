import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, SafeAreaView, Platform, StatusBar, Modal, KeyboardAvoidingView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import { useCateringSessionStore } from '../../store/useCateringSessionStore';
import { useRestaurantStore } from '../../store/useRestaurantStore';
import { useAddressStore } from '../../store/useAddressStore';
import { API_BASE_URL } from '../../constants/api';

export default function CateringEventDetails() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { selectedOutlet } = useRestaurantStore();
  
  const { 
    orderType, setOrderType,
    eventName, 
    date, 
    time, 
    occasion, 
    guestCount, 
    serviceType, 
    address, 
    restaurantId,
    restaurantName,
    setRestaurant,
    setEventDetails 
  } = useCateringSessionStore();

  useEffect(() => {
    const outletRestId = selectedOutlet?.restaurant_id || selectedOutlet?.id;
    if (outletRestId && (!restaurantId || restaurantId !== Number(outletRestId))) {
      setRestaurant(Number(outletRestId), selectedOutlet?.name || null);
    } else if (!restaurantId) {
      setRestaurant(1, 'Data Udipi — Mugalivakkam');
    }
  }, [selectedOutlet, restaurantId, setRestaurant]);

  const GOOGLE_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Google Places Autocomplete state
  const [addressPredictions, setAddressPredictions] = useState<any[]>([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [isAddressValidated, setIsAddressValidated] = useState(false);
  const { addresses: savedAddresses } = useAddressStore();

  // Modals state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedHour, setSelectedHour] = useState('12');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [selectedAmPm, setSelectedAmPm] = useState('PM');
  
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: ''
  });

  const showAlert = (title: string, message: string) => {
    setAlertConfig({ visible: true, title, message });
  };

  const fetchAddressPredictions = (text: string) => {
    setEventDetails({ address: text });
    setIsAddressValidated(false);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!text || text.trim().length <= 2) {
      setAddressPredictions([]);
      setShowPredictions(false);
      setIsSearchingAddress(false);
      return;
    }

    setIsSearchingAddress(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        let results: any[] = [];
        const encodedText = encodeURIComponent(text.trim());

        // 1. If on native, try direct Google Places API
        if (Platform.OS !== 'web') {
          try {
            const directUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodedText}&key=${GOOGLE_MAPS_KEY}&components=country:in`;
            const resp = await fetch(directUrl);
            const data = await resp.json();
            if (data.status === 'OK' && data.predictions) {
              results = data.predictions;
            }
          } catch (e) {
            console.log("Direct GMaps fetch failed, falling back to proxy:", e);
          }
        }

        // 2. If results empty (e.g. Web CORS or network issue), use backend proxy
        if (results.length === 0) {
          try {
            const proxyUrl = `${API_BASE_URL}/api/v1/public/maps/autocomplete?input=${encodedText}`;
            const resp = await fetch(proxyUrl);
            const data = await resp.json();
            if (data.status === 'OK' && data.predictions) {
              results = data.predictions;
            }
          } catch (e) {
            console.log("Backend proxy maps fetch failed:", e);
          }
        }

        // 3. Fallback to Expo geocoding if both are unavailable
        if (results.length === 0) {
          try {
            const geocoded = await Location.geocodeAsync(text.trim() + ', Tamil Nadu, India');
            if (geocoded && geocoded.length > 0) {
              results = geocoded.slice(0, 5).map((item, idx) => ({
                place_id: `expo_geo_${idx}_${item.latitude}_${item.longitude}`,
                description: `${text.trim()} (${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)})`,
                structured_formatting: {
                  main_text: text.trim(),
                  secondary_text: `Lat: ${item.latitude.toFixed(4)}, Lng: ${item.longitude.toFixed(4)}`
                }
              }));
            }
          } catch {
            // silent fallback
          }
        }

        const formattedList = results.map(item => ({
          place_id: item.place_id || Math.random().toString(),
          description: item.description || '',
          main_text: item.structured_formatting?.main_text || item.description || '',
          secondary_text: item.structured_formatting?.secondary_text || ''
        }));

        setAddressPredictions(formattedList);
        setShowPredictions(formattedList.length > 0);
      } catch (error) {
        console.error("Error fetching address predictions:", error);
        setAddressPredictions([]);
        setShowPredictions(false);
      } finally {
        setIsSearchingAddress(false);
      }
    }, 280);
  };

  const handleSelectPrediction = (prediction: { place_id: string; description: string }) => {
    setEventDetails({ address: prediction.description });
    setIsAddressValidated(true);
    setShowPredictions(false);
    setAddressPredictions([]);
  };

  const handleDetectLocation = async () => {
    setIsDetectingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Permission Denied', 'Please enable location permissions in device settings to detect your address.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude } = location.coords;
      let resolvedAddress = '';

      // Try direct Google Maps geocoding if native
      if (Platform.OS !== 'web') {
        try {
          const resp = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_KEY}`
          );
          const data = await resp.json();
          if (data.status === 'OK' && data.results && data.results.length > 0) {
            resolvedAddress = data.results[0].formatted_address;
          }
        } catch {
          // fallback
        }
      }

      // Try backend proxy if direct failed or on Web
      if (!resolvedAddress) {
        try {
          const resp = await fetch(
            `${API_BASE_URL}/api/v1/public/maps/geocode?address=${latitude},${longitude}`
          );
          const data = await resp.json();
          if (data.status === 'OK' && data.results && data.results.length > 0) {
            resolvedAddress = data.results[0].formatted_address;
          }
        } catch {
          // fallback
        }
      }

      // Fallback to Expo reverseGeocodeAsync
      if (!resolvedAddress) {
        try {
          const rev = await Location.reverseGeocodeAsync({ latitude, longitude });
          if (rev && rev.length > 0) {
            const r = rev[0];
            const parts = [r.name, r.street, r.subregion, r.city, r.postalCode].filter(Boolean);
            resolvedAddress = parts.join(', ');
          }
        } catch {
          // fallback
        }
      }

      if (resolvedAddress) {
        setEventDetails({ address: resolvedAddress });
        setIsAddressValidated(true);
        setShowPredictions(false);
      } else {
        showAlert('Location Detected', `Detected coordinates: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}. Please enter your street address.`);
      }
    } catch (e: any) {
      console.error('Error detecting location:', e);
      showAlert('Location Error', 'Unable to fetch your current location. Please type your address manually.');
    } finally {
      setIsDetectingLocation(false);
    }
  };

  const handleNext = async () => {
    const missingFields = [];
    if (!eventName.trim()) missingFields.push('Event Name');
    if (!date.trim()) missingFields.push('Date');
    if (!time.trim()) missingFields.push('Serving Time');
    if (!occasion.trim()) missingFields.push('Occasion');
    if (!address.trim()) missingFields.push('Delivery Address');

    if (missingFields.length > 0) {
      showAlert('Missing Information', `Please fill in the following missing fields:\n${missingFields.join(', ')}`);
      return;
    }
    
    const guests = parseInt(guestCount, 10);
    if (isNaN(guests) || guests < 50) {
      showAlert('Invalid Guest Count', 'The guest count should be minimum 50.');
      return;
    }

    if (!isAddressValidated && address.trim().length < 5) {
      showAlert('Invalid Address', 'Please enter a more complete delivery address or select a suggestion from the dropdown.');
      return;
    }

    const effectiveRestId = restaurantId || Number(selectedOutlet?.restaurant_id || selectedOutlet?.id || 1);
    const effectiveRestName = restaurantName || selectedOutlet?.name || 'Data Udipi';

    // Navigate to next step
    router.push({
      pathname: '/(main)/catering-choose-package',
      params: {
        eventName,
        date: date,
        time: time,
        occasion,
        guestCount: guests.toString(),
        serviceType,
        address,
        restaurantId: effectiveRestId.toString(),
        restaurantName: effectiveRestName,
      }
    });
  };

  // Interactive calendar generator
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const handlePrevMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
  };
  const handleNextMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));
  };

  const renderCalendar = () => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    // Month name might need a fallback if toLocaleString doesn't work perfectly in some older JS engines, but standard is fine
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthName = monthNames[month];

    const blanks = Array.from({ length: firstDay }, (_, i) => i);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    
    return (
      <Modal visible={showDatePicker} transparent animationType="fade">
        <View style={styles.alertOverlay}>
          <View style={styles.calendarBox}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity onPress={handlePrevMonth} style={styles.calNavBtn}>
                <Ionicons name="chevron-back" size={24} color="#111" />
              </TouchableOpacity>
              <Text style={styles.calendarTitle}>{monthName} {year}</Text>
              <TouchableOpacity onPress={handleNextMonth} style={styles.calNavBtn}>
                <Ionicons name="chevron-forward" size={24} color="#111" />
              </TouchableOpacity>
            </View>

            <View style={styles.weekDays}>
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                <Text key={day} style={styles.weekDayText}>{day}</Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {blanks.map(b => (
                <View key={`blank-${b}`} style={styles.calendarDay} />
              ))}
              {days.map(d => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const cellDate = new Date(year, month, d);
                const isPast = cellDate < today;

                return (
                  <TouchableOpacity 
                    key={d} 
                    style={[styles.calendarDay, isPast && { opacity: 0.3 }]} 
                    disabled={isPast}
                    onPress={() => {
                      setEventDetails({ date: `${d} ${monthName} ${year}` });
                      setShowDatePicker(false);
                    }}
                  >
                    <Text style={styles.calendarDayText}>{d}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={styles.alertBtn} onPress={() => setShowDatePicker(false)}>
              <Text style={styles.alertBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  const renderTimePicker = () => {
    return (
      <Modal visible={showTimePicker} transparent animationType="fade">
        <View style={styles.alertOverlay}>
          <View style={styles.calendarBox}>
            <Text style={styles.calendarTitle}>Select Time</Text>
            
            <View style={{flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20}}>
              {/* Hour Selection */}
              <View style={{alignItems: 'center'}}>
                <Text style={{fontSize: 12, color: '#666', marginBottom: 4}}>Hour</Text>
                <TextInput 
                  style={styles.timeInput} 
                  value={selectedHour} 
                  onChangeText={(val) => {
                    let num = parseInt(val);
                    if (num > 12) val = '12';
                    if (num < 1) val = '1';
                    setSelectedHour(val);
                  }}
                  keyboardType="numeric"
                  maxLength={2}
                />
              </View>
              <Text style={{fontSize: 24, fontWeight: 'bold', marginHorizontal: 10, marginTop: 15}}>:</Text>
              {/* Minute Selection */}
              <View style={{alignItems: 'center'}}>
                <Text style={{fontSize: 12, color: '#666', marginBottom: 4}}>Minute</Text>
                <TextInput 
                  style={styles.timeInput} 
                  value={selectedMinute} 
                  onChangeText={(val) => {
                    let num = parseInt(val);
                    if (num > 59) val = '59';
                    if (num < 0) val = '00';
                    setSelectedMinute(val);
                  }}
                  keyboardType="numeric"
                  maxLength={2}
                />
              </View>
              
              {/* AM/PM Toggle */}
              <View style={{marginLeft: 20, marginTop: 15}}>
                <TouchableOpacity 
                  style={[styles.ampmBtn, selectedAmPm === 'AM' && styles.ampmBtnActive]}
                  onPress={() => setSelectedAmPm('AM')}
                >
                  <Text style={[styles.ampmText, selectedAmPm === 'AM' && styles.ampmTextActive]}>AM</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.ampmBtn, selectedAmPm === 'PM' && styles.ampmBtnActive, {marginTop: 4}]}
                  onPress={() => setSelectedAmPm('PM')}
                >
                  <Text style={[styles.ampmText, selectedAmPm === 'PM' && styles.ampmTextActive]}>PM</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{flexDirection: 'row', gap: 10, width: '100%'}}>
              <TouchableOpacity style={[styles.alertBtn, {flex: 1, backgroundColor: '#f0f0f0'}]} onPress={() => setShowTimePicker(false)}>
                <Text style={[styles.alertBtnText, {color: '#333'}]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.alertBtn, {flex: 1, backgroundColor: '#ff4500'}]} onPress={() => {
                let h = selectedHour || '12';
                let m = selectedMinute.padStart(2, '0');
                if (m === '0' || m === '00' || !selectedMinute) m = '00';
                setEventDetails({ time: `${h}:${m} ${selectedAmPm}` });
                setShowTimePicker(false);
              }}>
                <Text style={styles.alertBtnText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const renderAlert = () => (
    <Modal visible={alertConfig.visible} transparent animationType="fade">
      <View style={styles.alertOverlay}>
        <View style={styles.alertBox}>
          <View style={[styles.alertIconBg, { backgroundColor: alertConfig.title === 'Success' ? '#e6ffe6' : '#ffe5e0' }]}>
            <Ionicons 
              name={alertConfig.title === 'Success' ? 'checkmark-circle' : 'warning'} 
              size={40} 
              color={alertConfig.title === 'Success' ? '#4CAF50' : '#ff4500'} 
            />
          </View>
          <Text style={styles.alertTitle}>{alertConfig.title}</Text>
          <Text style={styles.alertMessage}>{alertConfig.message}</Text>
          <TouchableOpacity 
            style={[styles.alertBtn, { backgroundColor: alertConfig.title === 'Success' ? '#4CAF50' : '#ff4500' }]} 
            onPress={() => setAlertConfig({ ...alertConfig, visible: false })}
          >
            <Text style={styles.alertBtnText}>Okay</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.stepText}>STEP 1 OF 6</Text>
          <Text style={styles.headerTitle}>Event Details</Text>
        </View>
        <MaterialCommunityIcons name="leaf" size={24} color="#8bc34a" style={styles.leafIcon} />
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={[styles.progressSegment, styles.progressActive]} />
        <View style={styles.progressSegment} />
        <View style={styles.progressSegment} />
        <View style={styles.progressSegment} />
        <View style={styles.progressSegment} />
        <View style={styles.progressSegment} />
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        
        {/* Order Type Toggle */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Order Type <Text style={styles.asterisk}>*</Text></Text>
          <View style={styles.segmentControl}>
            <TouchableOpacity 
              style={[styles.segmentBtn, orderType === 'Catering Order' && styles.segmentBtnActive]}
              onPress={() => setOrderType('Catering Order')}
            >
              <Text style={[styles.segmentText, orderType === 'Catering Order' && styles.segmentTextActive]}>CATERING ORDER</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.segmentBtn, orderType === 'Party Order' && styles.segmentBtnActive]}
              onPress={() => setOrderType('Party Order')}
            >
              <Text style={[styles.segmentText, orderType === 'Party Order' && styles.segmentTextActive]}>PARTY ORDER</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Event Name */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Event Name <Text style={styles.asterisk}>*</Text></Text>
          <TextInput 
            style={styles.input} 
            value={eventName}
            onChangeText={(text) => setEventDetails({ eventName: text })}
            placeholder="e.g. Birthday Party"
            placeholderTextColor="#999"
          />
        </View>

        {/* Date and Time Row */}
        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
            <Text style={styles.label}>Date <Text style={styles.asterisk}>*</Text></Text>
            <TouchableOpacity activeOpacity={0.8} onPress={() => setShowDatePicker(true)}>
              <View style={[styles.input, { justifyContent: 'center' }]}>
                <Text style={{ color: date ? '#333' : '#999', fontSize: 14 }}>
                  {date || 'DD MMMM YYYY'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
          <View style={[styles.inputGroup, { flex: 1, marginLeft: 10 }]}>
            <Text style={styles.label}>Serving Time <Text style={styles.asterisk}>*</Text></Text>
            <TouchableOpacity activeOpacity={0.8} onPress={() => setShowTimePicker(true)}>
              <View style={[styles.input, { justifyContent: 'center' }]}>
                <Text style={{ color: time ? '#333' : '#999', fontSize: 14 }}>
                  {time || 'e.g. 12:30 PM'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Occasion and Guest Count Row */}
        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
            <Text style={styles.label}>Occasion <Text style={styles.asterisk}>*</Text></Text>
            <TextInput 
              style={styles.input} 
              value={occasion}
              onChangeText={(text) => setEventDetails({ occasion: text })}
              placeholder="e.g. Wedding"
              placeholderTextColor="#999"
            />
          </View>
          <View style={[styles.inputGroup, { flex: 1, marginLeft: 10 }]}>
            <Text style={styles.label}>Guest Count (Min 50) <Text style={styles.asterisk}>*</Text></Text>
            <View style={styles.guestCounter}>
              <TextInput
                style={styles.guestInput}
                value={guestCount}
                onChangeText={(text) => setEventDetails({ guestCount: text })}
                keyboardType="numeric"
                maxLength={4}
              />
            </View>
          </View>
        </View>

        {/* Service Type */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Service Type <Text style={styles.asterisk}>*</Text></Text>
          <View style={styles.segmentControl}>
            <TouchableOpacity 
              style={[styles.segmentBtn, serviceType === 'Delivery Only' && styles.segmentBtnActive]}
              onPress={() => setEventDetails({ serviceType: 'Delivery Only' })}
            >
              <Text style={[styles.segmentText, serviceType === 'Delivery Only' && styles.segmentTextActive]}>Delivery Only</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.segmentBtn, serviceType === 'Full Service' && styles.segmentBtnActive]}
              onPress={() => setEventDetails({ serviceType: 'Full Service' })}
            >
              <Text style={[styles.segmentText, serviceType === 'Full Service' && styles.segmentTextActive]}>Full Service</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Delivery Address */}
        <View style={styles.inputGroup}>
          <View style={styles.addressLabelRow}>
            <Text style={styles.label}>
              Delivery Address <Text style={styles.asterisk}>*</Text>
            </Text>
            <TouchableOpacity 
              style={styles.detectLocationBtn} 
              onPress={handleDetectLocation}
              disabled={isDetectingLocation}
              activeOpacity={0.7}
            >
              {isDetectingLocation ? (
                <ActivityIndicator size="small" color="#ff4500" style={{ marginRight: 4 }} />
              ) : (
                <Ionicons name="navigate-circle-outline" size={15} color="#ff4500" style={{ marginRight: 4 }} />
              )}
              <Text style={styles.detectLocationText}>
                {isDetectingLocation ? 'Locating...' : 'Use Current Location'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Quick-select Saved Addresses if any */}
          {savedAddresses && savedAddresses.length > 0 && (
            <View style={styles.savedAddressesContainer}>
              <Text style={styles.savedAddressesHeader}>Saved Addresses</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedChipsScroll}>
                {savedAddresses.map((addr) => {
                  const full = addr.full_address || addr.address;
                  const isSelected = address === full;
                  return (
                    <TouchableOpacity
                      key={addr.id}
                      style={[styles.savedChip, isSelected && styles.savedChipActive]}
                      onPress={() => {
                        setEventDetails({ address: full });
                        setIsAddressValidated(true);
                        setShowPredictions(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={addr.type?.toLowerCase() === 'work' ? 'briefcase-outline' : 'home-outline'}
                        size={12}
                        color={isSelected ? '#fff' : '#ff4500'}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[styles.savedChipText, isSelected && styles.savedChipTextActive]}
                        numberOfLines={1}
                      >
                        {addr.type || 'Address'}: {addr.flat_house_no ? `${addr.flat_house_no}, ` : ''}{addr.landmark || addr.city || ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <View style={[
            styles.addressInputWrapper,
            showPredictions && addressPredictions.length > 0 && styles.addressInputWrapperActive
          ]}>
            <Ionicons name="location-sharp" size={18} color="#ff4500" style={styles.addressPinIcon} />
            <TextInput 
              style={styles.addressTextInput} 
              value={address}
              onChangeText={fetchAddressPredictions}
              placeholder="Search delivery address or area"
              placeholderTextColor="#999"
              multiline
              numberOfLines={2}
              textAlignVertical="center"
            />
            <View style={styles.addressActionIcons}>
              {isSearchingAddress && (
                <ActivityIndicator size="small" color="#ff4500" style={{ marginRight: 6 }} />
              )}
              {address.trim().length > 0 && (
                <TouchableOpacity 
                  onPress={() => {
                    setEventDetails({ address: '' });
                    setIsAddressValidated(false);
                    setAddressPredictions([]);
                    setShowPredictions(false);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close-circle" size={18} color="#aaa" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {showPredictions && addressPredictions.length > 0 && (
            <View style={styles.predictionsContainer}>
              <View style={styles.predictionsHeader}>
                <Text style={styles.predictionsHeaderTitle}>SUGGESTIONS FROM GOOGLE MAPS</Text>
                <Text style={styles.poweredByGoogle}>Google</Text>
              </View>
              <ScrollView 
                style={{ maxHeight: 220 }}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                {addressPredictions.map((prediction, index) => {
                  const mainText = prediction.main_text || prediction.description;
                  const secondaryText = prediction.secondary_text || '';
                  return (
                    <TouchableOpacity 
                      key={prediction.place_id || index} 
                      style={[styles.predictionItem, index === addressPredictions.length - 1 && {borderBottomWidth: 0}]}
                      onPress={() => handleSelectPrediction(prediction)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.markerCircle}>
                        <Ionicons name="location-sharp" size={13} color="#ff4500" />
                      </View>
                      <View style={styles.predictionTextContainer}>
                        <Text style={styles.predictionMainText} numberOfLines={1}>{mainText}</Text>
                        {secondaryText ? (
                          <Text style={styles.predictionSubText} numberOfLines={1}>{secondaryText}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom Button */}
      <View style={[styles.bottomContainer, { paddingBottom: insets.bottom > 0 ? insets.bottom + 10 : 20 }]}>
        <TouchableOpacity style={styles.chooseMenuBtn} onPress={handleNext}>
          <Text style={styles.chooseMenuBtnText}>Choose a Menu</Text>
        </TouchableOpacity>
      </View>
      </KeyboardAvoidingView>

      {renderCalendar()}
      {renderTimePicker()}
      {renderAlert()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 4,
  },
  headerTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  stepText: {
    fontSize: 10,
    color: '#ff4500',
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111',
  },
  leafIcon: {
    marginRight: 8,
  },
  progressContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 20,
    gap: 6,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 2,
  },
  progressActive: {
    backgroundColor: '#ff4500',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 350,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 8,
  },
  asterisk: {
    color: '#ff4500',
  },
  input: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#fff',
    minHeight: 46,
  },
  textArea: {
    minHeight: 80,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  guestCounter: {
    borderWidth: 1,
    borderColor: '#ff4500',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    minHeight: 46,
    justifyContent: 'center',
  },
  guestInput: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ff4500',
    padding: 0,
    margin: 0,
  },
  segmentControl: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#ff4500',
  },
  segmentText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#fff',
  },
  addressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detectLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff4f0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ffcbbb',
  },
  detectLocationText: {
    fontSize: 11,
    color: '#ff4500',
    fontWeight: '700',
  },
  savedAddressesContainer: {
    marginBottom: 10,
  },
  savedAddressesHeader: {
    fontSize: 10,
    color: '#888',
    fontWeight: 'bold',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  savedChipsScroll: {
    gap: 8,
    paddingBottom: 2,
  },
  savedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    maxWidth: 220,
  },
  savedChipActive: {
    backgroundColor: '#ff4500',
    borderColor: '#ff4500',
  },
  savedChipText: {
    fontSize: 11,
    color: '#444',
    fontWeight: '500',
  },
  savedChipTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  addressInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 52,
  },
  addressInputWrapperActive: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderColor: '#ff4500',
  },
  addressPinIcon: {
    marginRight: 8,
  },
  addressTextInput: {
    flex: 1,
    fontSize: 13,
    color: '#333',
    padding: 0,
    margin: 0,
    minHeight: 38,
  },
  addressActionIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 6,
  },
  predictionsContainer: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#ff4500',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    maxHeight: 250,
  },
  predictionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff8f5',
    borderBottomWidth: 1,
    borderBottomColor: '#fdeee8',
  },
  predictionsHeaderTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#ff4500',
    letterSpacing: 0.5,
  },
  poweredByGoogle: {
    fontSize: 9,
    fontWeight: '600',
    color: '#999',
  },
  predictionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  markerCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff2ec',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  predictionTextContainer: {
    flex: 1,
  },
  predictionMainText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111',
    marginBottom: 2,
  },
  predictionSubText: {
    fontSize: 11,
    color: '#777',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: '#fff',
  },
  chooseMenuBtn: {
    backgroundColor: '#00a023', // Green color
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  chooseMenuBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Alert Modal Styles matching Data Udipi
  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  alertBox: {
    backgroundColor: '#fff',
    borderRadius: 24,
    width: '90%',
    maxWidth: 320,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  alertIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  alertTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111',
    textAlign: 'center',
    marginBottom: 10,
  },
  alertMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  alertBtn: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#333',
  },
  alertBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  // Calendar Modal Styles
  calendarBox: {
    backgroundColor: '#fff',
    borderRadius: 24,
    width: '95%',
    maxWidth: 350,
    padding: 24,
    alignItems: 'center',
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  calNavBtn: {
    padding: 8,
  },
  calendarTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111',
  },
  weekDays: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 10,
  },
  weekDayText: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 12,
    color: '#999',
    fontWeight: 'bold',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
    marginBottom: 20,
  },
  calendarDay: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
  },
  calendarDayText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  timeInput: {
    width: 60,
    height: 60,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#111',
    backgroundColor: '#f9f9f9',
  },
  ampmBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fff',
  },
  ampmBtnActive: {
    backgroundColor: '#ff4500',
    borderColor: '#ff4500',
  },
  ampmText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
  },
  ampmTextActive: {
    color: '#fff',
  }
});
