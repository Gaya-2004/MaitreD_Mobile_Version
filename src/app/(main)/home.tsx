import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Image, ImageBackground, Platform, StatusBar, Alert, Modal, ActivityIndicator, Dimensions, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { customerApi, menuApi, tableApi, orderApi, dineInSessionApi } from '../../services/apiService';
import { getFullImageUrl } from '../../constants/api';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Device from 'expo-device';
import { useCartStore } from '../../store/useCartStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useRestaurantStore, useOrderStore, useLiveOrderStore } from '../../store';
import { useDineInSessionStore } from '../../store/useDineInSessionStore';
import BottomNavBar from '../../components/layout/BottomNavBar';
import ViewCartButton from '../../components/layout/ViewCartButton';
import DineInActiveBanner from '../../components/DineInActiveBanner';
import SelectTableModal from '../../components/ui/SelectTableModal';
import DineInConflictModal from '../../components/ui/DineInConflictModal';

export default function Home() {
  const router = useRouter();
  const params = useLocalSearchParams<{ autoPromptQR?: string; openScanner?: string }>();
  const phone = useAuthStore(s => s.phone);
  const selectedOutlet = useRestaurantStore(s => s.selectedOutlet);
  const dineInSession = useDineInSessionStore();
  const scrollRef = useRef<ScrollView>(null);
  const slideIndex = useRef(0);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const insets = useSafeAreaInsets();
  const cart = useCartStore(s => s.items);
  const addItem = useCartStore(s => s.addItem);
  const removeItem = useCartStore(s => s.removeItem);
  const incrementQuantity = useCartStore(s => s.incrementQuantity);
  const decrementQuantity = useCartStore(s => s.decrementQuantity);
  const getItemCount = useCartStore(s => s.getItemCount);
  const getSubtotal = useCartStore(s => s.getSubtotal);
  const orderType = useCartStore(s => s.orderType);
  const setOrderType = useCartStore(s => s.setOrderType);
  const clearCart = useCartStore(s => s.clearCart);
  const [isCartModalVisible, setIsCartModalVisible] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const cartItemCount = getItemCount();
  const subtotal = getSubtotal();

  const handleDineInOrder = async (payLater: boolean) => {
    if (!selectedOutlet?.restaurant_id) {
      Alert.alert('No Restaurant Selected', 'Please select an outlet before ordering.', [
        { text: 'Select Outlet', onPress: () => router.push('/outlet-selector') },
      ]);
      return;
    }
    const activeTable = tableNumber;
    if (!activeTable) {
      Alert.alert('No Table Selected', 'Please scan your table QR or enter a table number first.');
      return;
    }
    const rawCartItems = Object.values(cart).filter(item => item && item.quantity > 0);
    if (rawCartItems.length === 0) return;

    setIsPlacingOrder(true);
    try {
      const formattedCart = rawCartItems.map(item => ({
        id: Number(item.id),
        quantity: item.quantity,
        price: item.price,
        name: item.name,
        image: item.image,
      }));

      if (dineInSession.isActive && (dineInSession.sessionDbId || dineInSession.sessionUid || dineInSession.activeDbOrderId)) {
        // Create an independent Order round under the current Dine-In session
        const roundRes = await orderApi.createOrder({
          restaurant_id: selectedOutlet.restaurant_id,
          cart: formattedCart,
          subtotal: subtotal,
          total_amount: subtotal,
          order_type: 'DINE_IN',
          table_number: activeTable,
          payment_method: 'Pay Later',
          phone: phone || '',
          session_id: dineInSession.sessionDbId || undefined,
          session_uid: dineInSession.sessionUid || undefined,
        });

        const newOrderId = roundRes.orderId;
        const newDbOrderId = roundRes.dbOrderId;

        dineInSession.appendOrderRound(
          newOrderId,
          newDbOrderId,
          formattedCart,
          subtotal
        );

        useOrderStore.getState().addPastOrder({
          orderId: newOrderId,
          dbOrderId: String(newDbOrderId),
          date: new Date().toISOString(),
          total: subtotal,
          itemsCount: formattedCart.length,
          status: 'Preparing',
          payment_status: 'Pending',
          table_number: activeTable,
          order_type: 'Dine In',
          customer_phone: phone ?? '',
          items: formattedCart,
        });
        useLiveOrderStore.getState().setLiveOrder('Dine In', newOrderId, String(newDbOrderId), 'Preparing');
        clearCart();
        setIsCartModalVisible(false);

        // Immediately navigate to Track Order status screen
        router.push({
          pathname: '/track-order',
          params: {
            orderId: newOrderId,
            dbOrderId: String(newDbOrderId),
            sessionId: String(roundRes.sessionId || dineInSession.sessionDbId || ''),
            sessionUid: roundRes.sessionUid || dineInSession.sessionUid || '',
            tableNumber: activeTable,
            orderType: 'Dine In',
            cart: JSON.stringify(formattedCart),
          }
        });
      } else if (payLater) {
        // Place initial dine-in order with Pay Later
        const res = await orderApi.createOrder({
          restaurant_id: selectedOutlet.restaurant_id,
          cart: formattedCart,
          subtotal: subtotal,
          total_amount: subtotal,
          order_type: 'DINE_IN',
          table_number: activeTable,
          payment_method: 'Pay Later',
          phone: phone || '',
        });

        dineInSession.startDineInOrder(
          activeTable,
          res.orderId,
          res.dbOrderId,
          formattedCart,
          subtotal,
          { sessionId: res.sessionId, sessionUid: res.sessionUid }
        );
        useOrderStore.getState().addPastOrder({
          orderId: res.orderId,
          dbOrderId: String(res.dbOrderId),
          date: new Date().toISOString(),
          total: subtotal,
          itemsCount: formattedCart.length,
          status: 'Preparing',
          payment_status: 'Pending',
          table_number: activeTable,
          order_type: 'Dine In',
          customer_phone: phone ?? '',
          items: formattedCart,
        });
        useLiveOrderStore.getState().setLiveOrder('Dine In', res.orderId, String(res.dbOrderId), 'Preparing');
        clearCart();
        setIsCartModalVisible(false);

        // Immediately navigate to Track Order status screen
        router.push({
          pathname: '/track-order',
          params: {
            orderId: res.orderId,
            dbOrderId: String(res.dbOrderId),
            sessionId: String(res.sessionId || ''),
            sessionUid: res.sessionUid || '',
            tableNumber: activeTable,
            orderType: 'Dine In',
            cart: JSON.stringify(formattedCart),
          }
        });
      } else {
        setIsCartModalVisible(false);
        router.push({ pathname: '/checkout' });
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to place dine-in order. Please try again.');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const [isSelectTableModalVisible, setIsSelectTableModalVisible] = useState(false);
  const [isInvalidTable, setIsInvalidTable] = useState(false);
  const [isDineInConflictVisible, setIsDineInConflictVisible] = useState(false);

  const handleIncrement = (itemId: any, itemObj?: any) => {
    if (activeTab === 'Dine-in' || orderType === 'Dine In') {
      const activeTable = String(tableNumber || dineInSession.tableNumber || '').trim();
      if (!activeTable) {
        setIsInvalidTable(false);
        setIsSelectTableModalVisible(true);
        return;
      }
    }
    const existing = cart[itemId] || cart[String(itemId)] || cart[Number(itemId)];
    if (existing) {
      incrementQuantity(existing.id);
    } else {
      const item = itemObj || 
        (selectedItem && String(selectedItem.id) === String(itemId) ? selectedItem : null) ||
        (popularDishes || []).find((i: any) => String(i.id) === String(itemId));
      if (!item) return;
      addItem({
        id: item.id,
        name: item.name,
        price: item.price,
        image: item.image,
        quantity: 1,
        category: item.category || 'Popular',
        desc: item.desc
      });
    }
  };

  const handleDecrement = (itemId: any) => {
    const existing = cart[itemId] || cart[String(itemId)] || cart[Number(itemId)];
    if (existing) {
      decrementQuantity(existing.id);
    }
  };

  useEffect(() => {
    useCartStore.getState().removeDiscount();
  }, []);

  const [baseOffersList] = useState(() => {
    const isWeekend = new Date().getDay() === 0 || new Date().getDay() === 6;
    const base = [
      { id: '1', discount: '30% OFF', subtitle: 'On Your First Order', color: '#ff4500' },
      { id: '2', discount: '5% OFF', subtitle: 'On 5th Day (5 Days Continuous Orders)', color: '#4CAF50' },
    ];
    if (isWeekend) {
      base.push({ id: '3', discount: '5% OFF', subtitle: 'On Weekends', color: '#9C27B0' });
    } else {
      base.push({ id: '4', discount: '10% OFF', subtitle: 'On Weekdays', color: '#2196F3' });
    }
    return base;
  });

  const [usedOffers, setUsedOffers] = useState<string[]>([]);

  const offersList = React.useMemo(() => {
    const filteredBase = baseOffersList.filter(o => !usedOffers.includes(o.discount));
    if (filteredBase.length === 0) return [];
    // Duplicate items to simulate infinite scroll without rewinding
    return Array(50).fill(filteredBase).flat().map((o, i) => ({ ...o, uniqueId: `off-${i}` }));
  }, [baseOffersList, usedOffers]);

  useEffect(() => {
    const interval = setInterval(() => {
      slideIndex.current += 1;
      if (slideIndex.current >= offersList.length - 1) {
        slideIndex.current = 1;
        scrollRef.current?.scrollTo({ x: 335, animated: false });
        return;
      }
      scrollRef.current?.scrollTo({ x: slideIndex.current * 335, animated: true });
    }, 5000);

    return () => clearInterval(interval);
  }, [offersList.length]);
  const getInitialTab = () => {
    if (orderType === 'Take Away') return 'Takeaway';
    if (orderType === 'Delivery') return 'Delivery';
    return 'Dine-in';
  };
  const [activeTab, setActiveTab] = useState(getInitialTab());

  // Sync activeTab to orderType when user taps tabs
  useEffect(() => {
    if (activeTab === 'Takeaway' && orderType !== 'Take Away') setOrderType('Take Away');
    else if (activeTab === 'Dine-in' && orderType !== 'Dine In') setOrderType('Dine In');
    else if (activeTab === 'Delivery' && orderType !== 'Delivery') setOrderType('Delivery');
  }, [activeTab]);

  // Sync orderType to activeTab when changed externally (e.g. voice agent)
  useEffect(() => {
    if (orderType === 'Take Away' && activeTab !== 'Takeaway') {
      setActiveTab('Takeaway');
    } else if (orderType === 'Dine In' && activeTab !== 'Dine-in') {
      setActiveTab('Dine-in');
    } else if (orderType === 'Delivery' && activeTab !== 'Delivery') {
      setActiveTab('Delivery');
    }
  }, [orderType]);
  const [popularDishes, setPopularDishes] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedBranchName, setSelectedBranchName] = useState('Koramangala, Bangalore');
  const [searchText, setSearchText] = useState('');

  const [tableNumber, setTableNumber] = useState<string | null>(null);
  const [tableStatus, setTableStatus] = useState<string | null>(null);
  const [isScannerVisible, setIsScannerVisible] = useState(false);
  const [modalReady, setModalReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [isVerifyingTable, setIsVerifyingTable] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [mockTableNumber, setMockTableNumber] = useState('T-01');

  const [customAlert, setCustomAlert] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'info';
    buttons?: { text: string; onPress?: () => void; style?: 'cancel' | 'default' }[];
    onConfirm?: () => void;
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info'
  });

  const showPopup = (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info',
    onConfirm?: () => void,
    buttons?: { text: string; onPress?: () => void; style?: 'cancel' | 'default' }[]
  ) => {
    setCustomAlert({
      visible: true,
      title,
      message,
      type,
      buttons: buttons || (onConfirm ? [{ text: 'Continue', onPress: onConfirm }] : [{ text: 'Continue' }])
    });
  };

  useEffect(() => {
    const loadSavedTable = async () => {
      try {
        let saved = null;
        try {
          saved = await AsyncStorage.getItem('dineInTable');
        } catch (e) {
          // suppressed AsyncStorage warning
        }
        if (!saved) {
          try {
            if (typeof localStorage !== 'undefined') {
              saved = localStorage.getItem('dineInTable');
            }
          } catch (e) { }
        }
        if (!saved) {
          saved = (globalThis as any).dineInTable || null;
        }
        if (saved) {
          setTableNumber(saved);
          let restId = selectedOutlet?.restaurant_id ? Number(selectedOutlet.restaurant_id) : 1;
          tableApi.verifyTable(saved, restId)
            .then(data => {
               if (data.valid && data.table) {
                  setTableStatus(data.table.status);
                  if (data.table.status.toLowerCase() === 'vacant') {
                    AsyncStorage.removeItem('dineInTable').catch(() => {});
                    try {
                      if (typeof localStorage !== 'undefined') localStorage.removeItem('dineInTable');
                    } catch (e) {}
                    delete (globalThis as any).dineInTable;
                    setTableNumber(null);
                    setTableStatus(null);
                    useDineInSessionStore.getState().completeDineInSession();
                    useLiveOrderStore.getState().clearLiveOrder();
                  }
               }
            })
            .catch(() => {});
        }
      } catch (e) {
        console.warn("Failed to load saved table number:", e);
      }
    };
    loadSavedTable();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync dine-in session when viewing Dine-in tab to detect cancellations
  useEffect(() => {
    if (activeTab !== 'Dine-in') return;
    const sKey = dineInSession.sessionDbId || dineInSession.sessionUid || dineInSession.activeDbOrderId;
    if (dineInSession.isActive && sKey) {
      dineInSessionApi.getSessionDetails(sKey)
        .then(data => {
          if (!data) return;
          const isCancelled = (data.status || '').toUpperCase() === 'CANCELLED';
          const isCompleted = (data.status || '').toUpperCase() === 'COMPLETED';
          const activeBackRounds = (data.orders || []).filter(
            (o: any) => (o.status || '').toUpperCase() !== 'CANCELLED'
          );
          if (isCancelled || isCompleted || ((data.orders || []).length > 0 && activeBackRounds.length === 0)) {
            dineInSession.completeDineInSession();
            useLiveOrderStore.getState().clearLiveOrder();
          }
        })
        .catch(() => {});
    }
  }, [activeTab]);

  const handleDineInPress = async () => {
    setIsScannerVisible(true);
    setScanned(false);
    setCameraReady(false);
    if (!permission || !permission.granted) {
      try {
        await requestPermission();
      } catch (e) {
        console.warn("Failed to request camera permission:", e);
      }
    }
  };

  useEffect(() => {
    if (params?.openScanner === 'true') {
      handleDineInPress();
    } else if (params?.autoPromptQR === 'true') {
      const timer = setTimeout(() => {
        showPopup(
          "Scan Table QR Code",
          "Would you like to scan your table QR code to start ordering, or cancel to explore the menu?",
          "info",
          undefined,
          [
            { 
              text: "Scan Table QR", 
              onPress: () => {
                handleDineInPress();
              } 
            },
            { 
              text: "Cancel", 
              style: "cancel" 
            }
          ]
        );
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [params?.autoPromptQR]);

  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      // Retrieve selected restaurant ID
      let restId = selectedOutlet?.restaurant_id ? Number(selectedOutlet.restaurant_id) : 1;

      if (selectedOutlet?.name) {
        const cleanName = selectedOutlet.name.replace(/^Data Udipi\s*—\s*/i, '');
        setSelectedBranchName(cleanName);
      }

      // Fetch popular dishes
      const itemData = await menuApi.getItems(restId);
      const formattedItems = itemData.slice(0, 5).map((item: any) => ({
        id: item.id,
        name: item.name,
        desc: item.description,
        price: item.price,
        available: item.is_available ?? true,
        image: getFullImageUrl(item.image_url, item.name),
      }));
      setPopularDishes(formattedItems);

      // Fetch categories
      const catData = await menuApi.getCategories(restId);
      const categoryImageMap: Record<string, any> = {
        'breakfast & dinner': require('../../../assets/images/categories/breakfast_dinner.jpg'),
        'dosa varieties': require('../../../assets/images/categories/dosa_varieties.jpg'),
        'evening snacks': require('../../../assets/images/categories/evening_snacks.jpg'),
        'hot beverages': require('../../../assets/images/categories/hot_beverages.jpg'),
        'lunch': require('../../../assets/images/categories/lunch.jpg'),
        'noodles': { uri: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=500&auto=format&fit=crop&q=80' },
        'rice varieties': require('../../../assets/images/categories/rice_varieties.jpg'),
        'salad': require('../../../assets/images/categories/salad.jpg'),
        'soups': require('../../../assets/images/categories/soups.jpg'),
        'tandoori breads': require('../../../assets/images/categories/tandoori_breads.jpg'),
        'tandoori side dishes': require('../../../assets/images/categories/tandoori_side_dishes.jpg'),
        'tandoori starters': require('../../../assets/images/categories/tandoori_starters.jpg'),
        'raitha': require('../../../assets/images/categories/raitha.jpg'),
      };
      const getCategoryImage = (name: string) => {
        // Remove things like (MGR Nagar) and standardize typos like 'varities'
        const normalized = name.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').replace('varities', 'varieties').trim();
        return categoryImageMap[normalized] || { uri: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80' };
      };
      const getCategoryDisplayName = (c: any) => {
        if (c.description === 'South Indian' || c.description === 'North Indian') {
          // Strip the (MGR Nagar) or (Mugalivakkam) for a cleaner customer UI
          return c.name.replace(/\s*\(.*?\)\s*/g, '').trim();
        }
        if (c.name.startsWith('mugalivakkam_') || c.name.startsWith('mgrnagar_')) {
          return c.description || c.name;
        }
        return c.name;
      };

      const branchSuffix = selectedOutlet?.name ? selectedOutlet.name.replace(/^Data Udipi\s*[-—]\s*/i, '').trim() : '';

      const uniqueCatNames = new Set<string>();

      const formattedCats = catData
        .filter((c: any) => {
          if (c.name.toLowerCase() === 'all') return false;
          
          // Hide internal region categories
          if (c.name.includes('_all') || c.name.includes('_breakfast') || c.name.includes('_lunch') || c.name.includes('_dinner')) {
            return false;
          }
          
          const displayName = getCategoryDisplayName(c).trim();
          const lowerName = displayName.toLowerCase();
          
          // Hide 'all menu' entirely
          if (lowerName === 'all menu') return false;
          
          // Deduplicate categories with the exact same display name
          if (uniqueCatNames.has(lowerName)) {
            return false;
          }
          uniqueCatNames.add(lowerName);
          return true;
        })
        .map((c: any) => ({
          id: c.id,
          name: getCategoryDisplayName(c),
          image: getCategoryImage(c.name)
        }));
      setCategories(formattedCats);

      // Fetch user profile to get used offers
      try {
        const { customerId, phone: authPhone } = useAuthStore.getState();
        const targetPhone = phone || authPhone;
        
        if (customerId) {
          const profileData = await customerApi.getProfileById(customerId);
          if (profileData.used_offers) {
            setUsedOffers(profileData.used_offers);
          }
        } else if (targetPhone) {
          const profileData = await customerApi.getProfile(targetPhone);
          if (profileData.used_offers) {
            setUsedOffers(profileData.used_offers);
          }
        }
      } catch (e) {
          // Silently ignore if profile is not found or fails
      }
    } catch (e) {
      console.error('Error fetching home screen data', e);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOutlet]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const verifyTableAndEnter = async (tableNum: string) => {
    if (!tableNum.trim()) return;
    setIsVerifyingTable(true);
    try {
      const cleanTableNum = tableNum.trim();
      let restId = selectedOutlet?.restaurant_id ? Number(selectedOutlet.restaurant_id) : 1;
      
      let tableStatus = "Vacant";
      let isTableActive = true;
      
      // Verify table against the backend
      const data = await tableApi.verifyTable(cleanTableNum, restId);
      if (!data.valid) {
         showPopup("Invalid Table", data.message || "This table doesn't belong to the selected restaurant.", "error");
         setScanned(false);
         setIsVerifyingTable(false);
         return;
      }
      tableStatus = data.table.status;
      isTableActive = data.table.is_active;
      
      if (isTableActive === false) {
         showPopup("Table Inactive", "This table is currently marked as inactive and cannot be used.", "error");
         setScanned(false);
         setIsVerifyingTable(false);
         return;
      }
      let saved = false;
      try {
        await AsyncStorage.setItem('dineInTable', cleanTableNum);
        saved = true;
      } catch (e) {
        console.warn("AsyncStorage.setItem failed, using fallback:", e);
      }
      if (!saved) {
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('dineInTable', cleanTableNum);
            saved = true;
          }
        } catch (e) {
          console.warn("localStorage.setItem failed:", e);
        }
      }
      if (!saved) {
        (globalThis as any).dineInTable = cleanTableNum;
      }

      setTableNumber(cleanTableNum);
      setTableStatus(tableStatus);
      setIsScannerVisible(false);
      setScanned(false);

      showPopup(
        "Welcome!",
        `You are checked into Table ${cleanTableNum.replace('T-', '')}. Status: ${tableStatus}. Enjoy your meal!`,
        "success",
        () => {
          router.push({
            pathname: '/menu',
            params: {
              orderType: 'Dine In',
              tableNumber: cleanTableNum
            }
          });
        }
      );
    } catch (error) {
      console.error("Error verifying table:", error);
      showPopup("Error", "Something went wrong verifying the table. Please try again.", "error");
      setScanned(false);
    } finally {
      setIsVerifyingTable(false);
    }
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned || isVerifyingTable) return;
    setScanned(true);

    let tableNum = data ? data.trim() : '';
    if (tableNum.includes('?table=')) {
      const match = tableNum.match(/\?table=([^&]+)/);
      if (match) {
        tableNum = match[1];
      }
    } else if (tableNum.includes('&table=')) {
      const match = tableNum.match(/&table=([^&]+)/);
      if (match) {
        tableNum = match[1];
      }
    } else if (tableNum.includes('table=')) {
      const match = tableNum.match(/table=([^&]+)/);
      if (match) {
        tableNum = match[1];
      }
    }
    tableNum = decodeURIComponent(tableNum);
    verifyTableAndEnter(tableNum);
  };

  const handleCloseScanner = () => {
    setIsScannerVisible(false);
    setScanned(false);
    setModalReady(false);
    setCameraReady(false);
  };

  const handleClearTable = async () => {
    try {
      // Backend does not have a /vacate endpoint for customers.
      // We clear the table locally only.

      try {
        await AsyncStorage.removeItem('dineInTable');
      } catch (e) { }
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('dineInTable');
        }
      } catch (e) { }
    delete (globalThis as any).dineInTable;
    setTableNumber(null);
    setTableStatus(null);
    useDineInSessionStore.getState().completeDineInSession();
    useLiveOrderStore.getState().clearLiveOrder();
    showPopup("Table Cleared", "You have left the table.", "info");
    } catch (e) {
      console.warn("Failed to clear table:", e);
    }
  };

  const handleSearchSubmit = (query?: string) => {
    const searchVal = typeof query === 'string' ? query : searchText;
    if (activeTab === 'Dine-in' && !tableNumber) {
      showPopup(
        "Scan QR Code",
        "Please scan the QR code on your table to place dine-in orders, or explore the menu.",
        "info",
        undefined,
        [
          { text: "Scan QR", onPress: handleDineInPress },
          { 
            text: "Search Menu", 
            onPress: () => {
              router.push({
                pathname: '/menu',
                params: {
                  orderType: activeTab === 'Dine-in' ? 'Dine In' : activeTab,
                  tableNumber: activeTab === 'Dine-in' ? (tableNumber || '') : '',
                  search: searchVal
                }
              });
            }
          }
        ]
      );
      return;
    }
    router.push({
      pathname: '/menu',
      params: {
        orderType: activeTab === 'Dine-in' ? 'Dine In' : activeTab,
        tableNumber: activeTab === 'Dine-in' ? (tableNumber || '') : '',
        search: searchVal
      }
    });
  };

  const handleSearchFocus = () => {
    if (activeTab === 'Dine-in' && !tableNumber) {
      showPopup(
        "Scan QR Code",
        "Please scan the QR code on your table to view menu and order, or browse the menu.",
        "info",
        undefined,
        [
          { text: "Scan QR", onPress: handleDineInPress },
          { 
            text: "Browse Menu", 
            style: "default",
            onPress: () => {
              router.push({
                pathname: '/menu',
                params: {
                  orderType: activeTab === 'Dine-in' ? 'Dine In' : activeTab,
                  tableNumber: activeTab === 'Dine-in' ? (tableNumber || '') : '',
                  search: searchText
                }
              });
            }
          }
        ]
      );
      return;
    }
    router.push({
      pathname: '/menu',
      params: { orderType: activeTab === 'Dine-in' ? 'Dine In' : activeTab, tableNumber: activeTab === 'Dine-in' ? (tableNumber || '') : '', search: searchText }
    });
  };

  const handleOrderNow = () => {
    if (activeTab === 'Dine-in' && !tableNumber) {
      showPopup(
        "Scan QR Code",
        "Please scan the QR code on your table to view menu and order.",
        "info",
        undefined,
        [
          { text: "Scan QR", onPress: handleDineInPress },
          { text: "Search Menu", onPress: () => router.push('/menu') }
        ]
      );
      return;
    }
    router.push({
      pathname: '/menu',
      params: { orderType: activeTab === 'Dine-in' ? 'Dine In' : activeTab, tableNumber: activeTab === 'Dine-in' ? (tableNumber || '') : '' }
    });
  };

  const handleCategoryPress = (catId: number) => {
    if (activeTab === 'Dine-in' && !tableNumber) {
      showPopup(
        "Scan QR Code",
        "Please scan the QR code on your table to view menu and order.",
        "info",
        undefined,
        [
          { text: "Scan QR", onPress: handleDineInPress },
          { text: "Search Menu", onPress: () => router.push('/menu') }
        ]
      );
      return;
    }
    
    const catObj = categories.find(c => c.id === catId);
    const catName = catObj?.name || 'all';
    
    router.push({
      pathname: '/menu',
      params: {
        orderType: activeTab === 'Dine-in' ? 'Dine In' : activeTab,
        tableNumber: activeTab === 'Dine-in' ? (tableNumber || '') : '',
        categoryName: catName,
        categoryId: String(catId),
      }
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle='dark-content' backgroundColor='#fff' />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ff4500']} />
        }
      >

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/')}>
            <Image source={require('../../../assets/images/Dataudupi-Title.jpg')} style={styles.logo} resizeMode='contain' />
          </TouchableOpacity>
          <TouchableOpacity style={styles.profileBtn} onPress={() => router.push('/profile')}>
            <View style={[styles.profileImg, { backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' }]}>
              <Ionicons name="person" size={24} color="#aaa" />
            </View>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.locationContainer}
          onPress={() => router.push('/outlet-selector')}
          activeOpacity={0.7}
        >
          <Ionicons name='location' size={16} color='#ff4500' />
          <Text style={styles.locationText}>{selectedBranchName}</Text>
          <Ionicons name='chevron-down' size={16} color='#000' />
        </TouchableOpacity>

        {/* Search */}
        <View style={styles.searchBar}>
          <Ionicons name='search' size={20} color='#888' />
          <TextInput
            placeholder='Search crispy dosa, soft idli, filter coffee...'
            style={styles.searchInput}
            placeholderTextColor='#888'
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={() => handleSearchSubmit(searchText)}
            returnKeyType='search'
            onFocus={handleSearchFocus}
          />
          {searchText.trim().length > 0 && (
            <TouchableOpacity onPress={() => handleSearchSubmit(searchText)} style={{ padding: 4 }}>
              <Ionicons name='arrow-forward-circle' size={22} color='#ff4500' />
            </TouchableOpacity>
          )}
        </View>

        {/* Banner Carousel */}
        <View style={styles.carouselWrapper}>
          {offersList.length > 0 && (
            <ScrollView
              ref={scrollRef}
              horizontal
              snapToInterval={335}
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              style={styles.carouselContainer}
            >
              {offersList.map((offer) => (
                <View key={offer.uniqueId} style={styles.carouselSlide}>
                  <ImageBackground
                    source={require('../../../assets/images/banner_bg.jpg')}
                    style={styles.banner}
                    imageStyle={styles.bannerImage}
                    resizeMode="cover"
                  >
                    <View style={[styles.bannerOverlay, { backgroundColor: 'rgba(0, 0, 0, 0.35)' }]}>
                      <Text style={styles.bannerDiscount}>{offer.discount}</Text>
                      <Text style={styles.bannerSubtitle}>{offer.subtitle}</Text>
                      <TouchableOpacity style={styles.orderNowBtn} onPress={async () => {
                        showPopup(
                          "Congratulations! 🎉",
                          `You've selected the ${offer.discount} offer.`,
                          "success",
                          async () => {
                            if (activeTab === 'Dine-in' && !tableNumber) {
                              showPopup("Scan QR Code", "Please scan the QR code on your table to order.", "info", undefined, [
                                {
                                  text: "Scan QR", onPress: async () => {
                                    useCartStore.getState().applyDiscount(offer.discount);
                                    handleDineInPress();
                                  }
                                },
                                { text: "Search Menu", onPress: () => router.push('/menu') }
                              ]);
                              return;
                            }
                            useCartStore.getState().applyDiscount(offer.discount);
                            router.push({
                              pathname: '/menu',
                              params: { orderType: activeTab === 'Dine-in' ? 'Dine In' : activeTab, tableNumber: activeTab === 'Dine-in' ? (tableNumber || '') : '' }
                            });
                          }
                        );
                      }}>
                        <Text style={styles.orderNowText}>Order Now</Text>
                      </TouchableOpacity>
                    </View>
                  </ImageBackground>
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Dine-in / Takeaway / Delivery Tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'Dine-in' && styles.activeTabBtn]}
            onPress={() => {
              setActiveTab('Dine-in');
              if (!tableNumber) {
                handleDineInPress();
              }
            }}
          >
            <Text style={[styles.tabText, activeTab === 'Dine-in' && styles.activeTabText]}>Dine-in</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'Takeaway' && styles.activeTabBtn]}
            onPress={() => setActiveTab('Takeaway')}
          >
            <Text style={[styles.tabText, activeTab === 'Takeaway' && styles.activeTabText]}>Takeaway</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'Delivery' && styles.activeTabBtn]}
            onPress={() => {
              const activeRounds = (dineInSession.orderRounds || []).filter(
                (r: any) => (r.status || '').toUpperCase() !== 'CANCELLED'
              );
              const hasActiveDineIn = dineInSession.isActive && dineInSession.paymentStatus !== 'Paid' && (activeRounds.length > 0 || (dineInSession.totalAmount > 0 && !dineInSession.activeOrderId));
              if (hasActiveDineIn) {
                setIsDineInConflictVisible(true);
                return;
              }
              setActiveTab('Delivery');
              router.push('/(address)/add-address');
            }}
          >
            <Text style={[styles.tabText, activeTab === 'Delivery' && styles.activeTabText]}>Delivery</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'Bulk' && styles.activeTabBtn]}
            onPress={() => {
              router.push('/(main)/bulk-catering');
            }}
          >
            <Text style={[styles.tabText, activeTab === 'Bulk' && styles.activeTabText]}>Catering</Text>
          </TouchableOpacity>
        </View>

        {/* Table Status Card for Dine-in */}
        {activeTab === 'Dine-in' && (
          <View style={styles.tableStatusCard}>
            {tableNumber ? (
              <View style={styles.tableStatusRow}>
                <View style={styles.tableStatusLeft}>
                  <Ionicons name="restaurant" size={20} color="#ff4500" />
                  <Text style={styles.tableStatusText}>
                    Seated at Table <Text style={{ fontWeight: 'bold', color: '#ff4500' }}>{tableNumber.replace('T-', '')}</Text>
                    {tableStatus ? <Text style={{ color: tableStatus.toLowerCase() === 'vacant' ? '#4CAF50' : '#ff4500' }}> ({tableStatus})</Text> : null}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity style={styles.tableActionBtn} onPress={handleDineInPress}>
                    <Text style={styles.tableActionText}>Change</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.tableActionBtn, { backgroundColor: '#ffe5e0' }]} onPress={handleClearTable}>
                    <Text style={[styles.tableActionText, { color: '#ff4500' }]}>Leave</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.tableStatusRow}>
                <View style={styles.tableStatusLeft}>
                  <Ionicons name="qr-code-outline" size={20} color="#666" />
                  <Text style={[styles.tableStatusText, { color: '#666' }]}>Scan table QR code to start</Text>
                </View>
                <TouchableOpacity style={[styles.tableActionBtn, { backgroundColor: '#ff4500' }]} onPress={handleDineInPress}>
                  <Text style={[styles.tableActionText, { color: '#fff' }]}>Scan QR</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Categories */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Explore Categories</Text>
          <TouchableOpacity onPress={() => {
            if (activeTab === 'Dine-in' && !tableNumber) {
              showPopup("Scan QR Code", "Please scan the QR code on your table to view menu and order.", "info", undefined, [
                { text: "Scan QR", onPress: handleDineInPress },
                { text: "Search Menu", onPress: () => router.push('/menu') }
              ]);
              return;
            }
            router.push({
              pathname: '/for-you',
              params: { orderType: activeTab === 'Dine-in' ? 'Dine In' : activeTab, tableNumber: activeTab === 'Dine-in' ? (tableNumber || '') : '' }
            });
          }}>
            <Text style={[styles.seeAllText, { color: '#ff4500' }]}>For You ✨</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoriesScroll}>
          {categories.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={styles.categoryItem}
              onPress={() => {
                if (activeTab === 'Dine-in' && !tableNumber) {
                  showPopup("Scan QR Code", "Please scan the QR code on your table to view menu and order.", "info", undefined, [
                    { text: "Scan QR", onPress: handleDineInPress },
                    { text: "Search Menu", onPress: () => router.push('/menu') }
                  ]);
                  return;
                }
                router.push({
                  pathname: '/menu',
                  params: {
                    orderType: activeTab === 'Dine-in' ? 'Dine In' : activeTab,
                    tableNumber: activeTab === 'Dine-in' ? (tableNumber || '') : '',
                    categoryName: cat.name,
                    categoryId: String(cat.id),
                  }
                });
              }}
            >
              <Image source={cat.image} style={styles.categoryImage} />
              <Text style={styles.categoryName}>{cat.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Popular Dishes */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Popular Dishes</Text>
          <TouchableOpacity onPress={() => {
            if (activeTab === 'Dine-in' && !tableNumber) {
              showPopup("Scan QR Code", "Please scan the QR code on your table to view menu and order.", "info", undefined, [
                { text: "Scan QR", onPress: handleDineInPress },
                { text: "Search Menu", onPress: () => router.push('/menu') }
              ]);
              return;
            }
            router.push({
              pathname: '/menu',
              params: { orderType: activeTab === 'Dine-in' ? 'Dine In' : activeTab, tableNumber: activeTab === 'Dine-in' ? (tableNumber || '') : '' }
            });
          }}>
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        </View>

        {popularDishes.map(dish => (
          <TouchableOpacity
            key={dish.id}
            style={styles.dishCard}
            onPress={() => {
              if (activeTab === 'Dine-in' && !tableNumber) {
                showPopup("Scan QR Code", "Please scan the QR code on your table to view menu and order.", "info", undefined, [
                  { text: "Scan QR", onPress: handleDineInPress },
                  { text: "Search Menu", onPress: () => router.push('/menu') }
                ]);
                return;
              }
              setSelectedItem(dish);
            }}
          >
            <Image source={{ uri: dish.image }} style={styles.dishImage} />
            <View style={styles.dishInfo}>
              <View style={styles.dishMeta}>
              </View>
              <Text style={styles.dishName}>{dish.name}</Text>
              <Text style={styles.dishDesc} numberOfLines={1}>{dish.desc}</Text>
              <View style={styles.dishFooter}>
                <Text style={styles.dishPrice}>Rs. {dish.price}</Text>
                {cart[dish.id] && cart[dish.id].quantity > 0 ? (
                  <View style={styles.dishStepper}>
                    <TouchableOpacity
                      style={styles.dishStepBtnMinus}
                      onPress={() => decrementQuantity(dish.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="remove" size={14} color="#ff4500" />
                    </TouchableOpacity>
                    <Text style={styles.dishStepVal}>{cart[dish.id].quantity}</Text>
                    <TouchableOpacity
                      style={styles.dishStepBtnPlus}
                      onPress={() => incrementQuantity(dish.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="add" size={14} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.addBtn}
                    onPress={() => {
                      if (activeTab === 'Dine-in' || orderType === 'Dine In') {
                        const activeTable = String(tableNumber || dineInSession.tableNumber || '').trim();
                        if (!activeTable) {
                          setIsInvalidTable(false);
                          setIsSelectTableModalVisible(true);
                          return;
                        }
                      }
                      const cartItem = {
                        id: dish.id,
                        name: dish.name,
                        price: dish.price,
                        image: dish.image,
                        quantity: 1,
                        category: 'Popular',
                        desc: dish.desc,
                      };
                      addItem(cartItem);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="add" size={15} color="#fff" style={{ marginRight: 2 }} />
                    <Text style={styles.addBtnText}>ADD</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </TouchableOpacity>
        ))}

        {/* QR Scanner / Table Selector Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={isScannerVisible}
          onRequestClose={handleCloseScanner}
          onShow={() => setModalReady(true)}
        >
          <View style={styles.scannerModalOverlay}>
            <View style={styles.scannerModalContainer}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="qr-code-outline" size={22} color="#ff4500" />
                  <Text style={styles.modalTitle}>Scan Table QR Code</Text>
                </View>
                <TouchableOpacity onPress={handleCloseScanner} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close-circle" size={28} color="#888" />
                </TouchableOpacity>
              </View>

              {/* Camera view on physical devices or Simulated View on iOS Simulator */}
              {!Device.isDevice && Platform.OS === 'ios' ? (
                <View style={styles.simulatorFallbackContainer}>
                  <View style={styles.simulatedViewfinder}>
                    <Ionicons name="qr-code" size={56} color="#ff4500" />
                    <View style={styles.simulatedScanFrame} />
                  </View>
                  <View style={styles.simBadge}>
                    <Ionicons name="desktop-outline" size={13} color="#444" />
                    <Text style={styles.simBadgeText}>iOS Simulator (No Physical Camera Feed)</Text>
                  </View>
                  <Text style={styles.simFallbackText}>
                    Tap any table below to test the dine-in menu immediately:
                  </Text>
                </View>
              ) : permission && permission.granted ? (
                <View style={styles.cameraWrapper}>
                  {modalReady && (
                    <CameraView
                      key={isScannerVisible ? 'scanner-active' : 'scanner-idle'}
                      style={styles.cameraPreview}
                      facing="back"
                      autofocus="on"
                      onCameraReady={() => setCameraReady(true)}
                      onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
                      barcodeScannerSettings={{
                        barcodeTypes: ['qr'],
                      }}
                    />
                  )}
                  {!cameraReady && (
                    <View style={styles.cameraLoadingOverlay}>
                      <ActivityIndicator size="large" color="#ff4500" />
                      <Text style={{ color: '#fff', fontSize: 12, marginTop: 8, fontWeight: '600' }}>
                        Starting camera...
                      </Text>
                    </View>
                  )}
                  <View style={styles.scanOverlayContainer} pointerEvents="none">
                    <View style={styles.scanTargetFrame} />
                    <Text style={styles.scanInstructionText}>
                      Align the Table QR Code inside the square
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.webFallbackContainer}>
                  <Ionicons name="camera-outline" size={44} color="#ff4500" style={{ marginBottom: 10 }} />
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#222', marginBottom: 6, textAlign: 'center' }}>
                    Camera Access Needed
                  </Text>
                  <Text style={styles.webFallbackText}>
                    Allow camera access to scan your table QR code, or select a table below.
                  </Text>
                  <TouchableOpacity
                    style={styles.enableCameraBtn}
                    onPress={async () => {
                      try {
                        await requestPermission();
                      } catch (e) {
                        console.warn(e);
                      }
                    }}
                  >
                    <Ionicons name="camera" size={16} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>Enable Camera</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Quick Table Selection & Manual Input */}
              <View style={{ marginTop: 16, width: '100%', backgroundColor: '#fcfcfc', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#eee' }}>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Or Select / Enter Table Number:
                </Text>

                {/* Quick Chips for Tables */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {['T-01', 'T-02', 'T-03', 'T-04', 'T-05', 'T-06'].map((tbl) => (
                    <TouchableOpacity
                      key={tbl}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 6,
                        backgroundColor: mockTableNumber === tbl ? '#ff4500' : '#f0f0f0',
                      }}
                      onPress={() => {
                        setMockTableNumber(tbl);
                        verifyTableAndEnter(tbl);
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: mockTableNumber === tbl ? '#fff' : '#333' }}>
                        {tbl}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Manual Input Field */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' }}>
                  <TextInput
                    placeholder="e.g. T-04"
                    style={{ flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, height: 40, backgroundColor: '#fff', color: '#000', fontSize: 13 }}
                    onChangeText={setMockTableNumber}
                    value={mockTableNumber}
                  />
                  <TouchableOpacity
                    style={{ backgroundColor: '#ff4500', paddingHorizontal: 16, height: 40, justifyContent: 'center', borderRadius: 8 }}
                    onPress={() => verifyTableAndEnter(mockTableNumber || 'T-01')}
                    disabled={isVerifyingTable}
                  >
                    {isVerifyingTable ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>Check In</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>

      </ScrollView>

      {/* Active Dine-In Session Banner */}
      <DineInActiveBanner bottomOffset={Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 12) + (cartItemCount > 0 ? 132 : 72)} />

      {/* Floating Buttons (Identical to Search screen) */}
      <View style={[styles.floatingContainer, { bottom: Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 12) + 76 }]}>
        {cartItemCount > 0 && (
          <ViewCartButton />
        )}
      </View>

      {/* Bottom Navigation */}
      <BottomNavBar
        activeTab="home"
        onSearchPress={() => {
          if (activeTab === 'Dine-in' && !tableNumber) {
            showPopup("Scan QR Code", "Please scan the QR code on your table to place dine-in orders, or continue to search the menu.", "info", undefined, [
              { text: "Scan QR", onPress: handleDineInPress },
              { 
                text: "Search Menu", 
                onPress: () => {
                  router.push({ 
                    pathname: '/menu', 
                    params: { 
                      orderType: activeTab === 'Dine-in' ? 'Dine In' : activeTab, 
                      tableNumber: activeTab === 'Dine-in' ? (tableNumber || '') : '',
                      search: searchText
                    } 
                  });
                }
              }
            ]);
            return;
          }
          router.push({ pathname: '/menu', params: { orderType: activeTab === 'Dine-in' ? 'Dine In' : activeTab, tableNumber: activeTab === 'Dine-in' ? (tableNumber || '') : '', search: searchText } });
        }}
      />

      {/* Item Details Modal */}
      <Modal
        visible={!!selectedItem}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedItem(null)}
      >
        <TouchableOpacity 
          style={styles.itemModalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedItem(null)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.itemModalContent}>
            {selectedItem && (
              <>
                <View style={styles.itemModalHero}>
                  <Image source={{ uri: selectedItem.image }} style={styles.itemModalImg} resizeMode="cover" />
                </View>
                
                {(() => {
                  const isAvail = selectedItem.available !== false;
                  const itemQty = cart[selectedItem.id]?.quantity ?? cart[String(selectedItem.id)]?.quantity ?? 0;

                  return (
                    <>
                      <ScrollView contentContainerStyle={styles.itemModalBody}>
                        <View style={[styles.availBadge, !isAvail && styles.unavailBadge, { alignSelf: 'flex-start', marginBottom: 8 }]}>
                          <View style={[styles.availDot, !isAvail && styles.unavailDot]} />
                          <Text style={[styles.availText, !isAvail && styles.unavailText]}>
                            {isAvail ? 'Available' : 'Not Available'}
                          </Text>
                        </View>
                        <Text style={styles.itemModalTitle}>{selectedItem.name}</Text>
                        <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#ff4500', marginBottom: 8 }}>Rs. {selectedItem.price}</Text>
                        {selectedItem.desc ? <Text style={styles.itemModalDesc}>{selectedItem.desc}</Text> : null}
                      </ScrollView>

                      <View style={[styles.itemModalFooter, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                        <View style={styles.modalStepper}>
                          <TouchableOpacity 
                            style={[styles.modalStepBtnMinus, (!isAvail || itemQty === 0) && styles.stepBtnDisabled]}
                            onPress={() => handleDecrement(selectedItem.id)}
                            disabled={!isAvail || itemQty === 0}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="remove" size={20} color={(!isAvail || itemQty === 0) ? "#ccc" : "#f87171"} />
                          </TouchableOpacity>
                          <Text style={styles.modalStepVal}>{itemQty}</Text>
                          <TouchableOpacity 
                            style={[styles.modalStepBtnPlus, !isAvail && styles.stepBtnDisabled]}
                            onPress={() => handleIncrement(selectedItem.id, selectedItem)}
                            disabled={!isAvail}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="add" size={20} color="#fff" />
                          </TouchableOpacity>
                        </View>
                        
                        <TouchableOpacity 
                          style={[styles.itemModalAddBtn, !isAvail && { backgroundColor: '#ccc' }]} 
                          onPress={() => {
                            if (!isAvail) return;
                            handleIncrement(selectedItem.id, selectedItem);
                            setSelectedItem(null);
                          }}
                          disabled={!isAvail}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.itemModalAddText}>Add Item <Ionicons name="add" size={16} color="#fff" /></Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  );
                })()}
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Custom Premium Alert Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={customAlert.visible}
        onRequestClose={() => setCustomAlert(prev => ({ ...prev, visible: false }))}
      >
        <TouchableOpacity style={styles.alertOverlay} activeOpacity={1} onPress={() => setCustomAlert(prev => ({ ...prev, visible: false }))}>
          <TouchableOpacity activeOpacity={1} style={styles.alertBox}>
            <View style={[
              styles.alertIconBg,
              customAlert.type === 'success' && { backgroundColor: '#e6ffe6' },
              customAlert.type === 'error' && { backgroundColor: '#ffe5e0' },
              customAlert.type === 'info' && { backgroundColor: '#e6f2ff' }
            ]}>
              <Ionicons
                name={
                  customAlert.type === 'success'
                    ? 'checkmark-circle'
                    : customAlert.type === 'error'
                      ? 'alert-circle'
                      : 'information-circle'
                }
                size={48}
                color={
                  customAlert.type === 'success'
                    ? '#00cc66'
                    : customAlert.type === 'error'
                      ? '#ff4500'
                      : '#1e90ff'
                }
              />
            </View>
            <Text style={styles.alertTitle}>{customAlert.title}</Text>
            <Text style={styles.alertMessage}>{customAlert.message}</Text>
            <View style={[styles.alertBtnContainer, customAlert.buttons && customAlert.buttons.length > 2 ? { flexDirection: 'column' } : { flexDirection: 'row' }]}>
              {customAlert.buttons && customAlert.buttons.length > 0 ? (
                customAlert.buttons.map((btn, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.alertBtn,
                      btn.style === 'cancel'
                        ? { backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#ccc' }
                        : { backgroundColor: '#ff4500' },
                      (!customAlert.buttons || customAlert.buttons.length <= 2) && { flex: 1 }
                    ]}
                    onPress={() => {
                      setCustomAlert(prev => ({ ...prev, visible: false }));
                      if (btn.onPress) {
                        btn.onPress();
                      }
                    }}
                  >
                    <Text style={[
                      styles.alertBtnText,
                      btn.style === 'cancel' && { color: '#666' }
                    ]}>
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                ))
              ) : (
                <TouchableOpacity
                  style={[
                    styles.alertBtn,
                    customAlert.type === 'success' && { backgroundColor: '#00cc66' },
                    customAlert.type === 'error' && { backgroundColor: '#ff4500' },
                    customAlert.type === 'info' && { backgroundColor: '#1e90ff' }
                  ]}
                  onPress={() => {
                    setCustomAlert(prev => ({ ...prev, visible: false }));
                    if (customAlert.onConfirm) {
                      customAlert.onConfirm();
                    }
                  }}
                >
                  <Text style={styles.alertBtnText}>Continue</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Cart Modal (Identical to Search / Menu screen) */}
      <Modal
        visible={isCartModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsCartModalVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setIsCartModalVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.bottomSheet}>
            <View style={styles.dragHandle} />
            
             <View style={styles.cartHeaderRow}>
              <Text style={styles.cartTitle}>Cart</Text>
              {orderType === "Dine In" && tableNumber ? (
                <View style={styles.tableSelector}>
                  <Text style={styles.tableSelectorText}>Table No : {tableNumber.replace('T-', '')}</Text>
                  <Ionicons name="chevron-down" size={14} color="#00a01d" />
                </View>
              ) : null}
            </View>
            <Text style={styles.orderIdText}># Order Status : Pending</Text>

            <View style={styles.orderTypeContainer}>
              <TouchableOpacity 
                style={[styles.orderTypeBtn, orderType === "Dine In" && styles.orderTypeActive]}
                onPress={() => setOrderType("Dine In")}
              >
                <Ionicons name="restaurant-outline" size={16} color={orderType === "Dine In" ? "#fff" : "#ccc"} />
                <Text style={orderType === "Dine In" ? styles.orderTypeActiveText : styles.orderTypeInactiveText}>Dine In</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.orderTypeBtn, orderType === "Take Away" && styles.orderTypeActive]}
                onPress={() => setOrderType("Take Away")}
              >
                <Ionicons name="bag-handle-outline" size={16} color={orderType === "Take Away" ? "#fff" : "#ccc"} />
                <Text style={orderType === "Take Away" ? styles.orderTypeActiveText : styles.orderTypeInactiveText}>Take Away</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.orderTypeBtn, orderType === "Delivery" && styles.orderTypeActive]}
                onPress={() => setOrderType("Delivery")}
              >
                <Ionicons name="bicycle-outline" size={16} color={orderType === "Delivery" ? "#fff" : "#ccc"} />
                <Text style={orderType === "Delivery" ? styles.orderTypeActiveText : styles.orderTypeInactiveText}>Delivery</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.cartItemsScroll} contentContainerStyle={{ paddingTop: 12, paddingRight: 12, paddingLeft: 4, paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
              {Object.values(cart).map((item) => {
                if (!item || item.quantity <= 0) return null;
                const itemImg = item.image || 'https://via.placeholder.com/150';
                return (
                  <View key={item.id} style={styles.cartItemCard}>
                    <TouchableOpacity 
                      style={styles.removeBtn} 
                      onPress={() => removeItem(item.id as any)}
                    >
                      <Ionicons name="close" size={14} color="#fff" />
                    </TouchableOpacity>
                    <View style={styles.cartItemTop}>
                      <Image source={{ uri: itemImg }} style={styles.cartItemImg} resizeMode="cover" />
                      <View style={styles.cartItemInfo}>
                        <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.cartItemPrice}>Rs. {item.price}</Text>
                      </View>
                      <View style={styles.cartItemRight}>
                        <View style={styles.stepper}>
                          <TouchableOpacity style={styles.stepBtnMinus} onPress={() => decrementQuantity(item.id as any)}>
                            <Ionicons name="remove" size={16} color="#f87171" />
                          </TouchableOpacity>
                          <Text style={styles.stepVal}>{item.quantity}</Text>
                          <TouchableOpacity style={styles.stepBtnPlus} onPress={() => incrementQuantity(item.id as any)}>
                            <Ionicons name="add" size={16} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                    <TextInput 
                      style={styles.instructionInput}
                      placeholder="Please, Just a little bit spicy only...."
                      placeholderTextColor="#999"
                    />
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.placeOrderContainer}>
              {orderType === "Dine In" ? (
                dineInSession.isActive && dineInSession.activeDbOrderId ? (
                  <TouchableOpacity
                    style={styles.placeOrderBtn}
                    onPress={() => handleDineInOrder(true)}
                    disabled={isPlacingOrder}
                    activeOpacity={0.85}
                  >
                    {isPlacingOrder ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.placeOrderText}>
                        Add to Table Order (#{dineInSession.activeOrderId})
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <>
                    <TouchableOpacity
                      style={styles.placeOrderBtn}
                      onPress={() => handleDineInOrder(true)}
                      disabled={isPlacingOrder}
                      activeOpacity={0.85}
                    >
                      {isPlacingOrder ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.placeOrderText}>
                          Order Now (Pay at End of Meal)
                        </Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.payNowSecondaryBtn}
                      onPress={() => {
                        setIsCartModalVisible(false);
                        router.push({ pathname: '/checkout' });
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.payNowSecondaryText}>or Pay Now via Checkout ›</Text>
                    </TouchableOpacity>
                  </>
                )
              ) : (
                <TouchableOpacity
                  style={styles.placeOrderBtn}
                  onPress={() => {
                    setIsCartModalVisible(false);
                    router.push({ pathname: '/checkout' });
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.placeOrderText}>Place Order</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Select Table First Modal */}
      <SelectTableModal
        visible={isSelectTableModalVisible}
        onClose={() => setIsSelectTableModalVisible(false)}
        isInvalidTable={isInvalidTable}
        tableNumber={tableNumber || dineInSession.tableNumber}
        onSelectTable={() => {
          setIsSelectTableModalVisible(false);
          handleDineInPress();
        }}
      />

      {/* Active Dine-In Conflict Modal */}
      <DineInConflictModal
        visible={isDineInConflictVisible}
        onClose={() => setIsDineInConflictVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 180,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 0,
  },
  logo: {
    width: 150,
    height: 40,
  },
  profileBtn: {
    padding: 5,
  },
  profileImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 5,
  },
  locationText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 25,
    paddingHorizontal: 15,
    height: 50,
    marginBottom: 20,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
  },
  carouselWrapper: {
    marginBottom: 20,
  },
  carouselContainer: {
    overflow: 'visible',
  },
  carouselSlide: {
    width: 320,
    marginRight: 15,
  },
  banner: {
    width: '100%',
    borderRadius: 15,
    overflow: 'hidden',
    height: 160,
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
    borderRadius: 15,
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    padding: 20,
    justifyContent: 'center',
    alignItems: 'flex-start',
    borderRadius: 15,
  },
  bannerDiscount: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  bannerSubtitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
    marginBottom: 12,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  orderNowBtn: {
    backgroundColor: '#ff3400',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignSelf: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  orderNowText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 25,
    marginBottom: 25,
    padding: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 25,
  },
  activeTabBtn: {
    backgroundColor: '#ff4500',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  activeTabText: {
    color: '#fff',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 25,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  seeAllText: {
    color: '#ff4500',
    fontWeight: '600',
  },
  categoriesScroll: {
    marginTop: 15,
  },
  categoryItem: {
    alignItems: 'center',
    marginRight: 20,
  },
  categoryImage: {
    width: 70,
    height: 70,
    borderRadius: 35,
    marginBottom: 8,
  },
  categoryName: {
    fontSize: 12,
    fontWeight: '500',
  },
  dishCard: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#f0f0f0',
    borderRadius: 15,
    padding: 10,
    marginBottom: 15,
  },
  dishImage: {
    width: 90,
    height: 90,
    borderRadius: 10,
  },
  dishInfo: {
    flex: 1,
    marginLeft: 15,
    justifyContent: 'space-between',
  },
  dishMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dishRating: {
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 5,
    marginRight: 10,
  },
  dishTime: {
    fontSize: 12,
    color: '#888',
  },
  dishName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 5,
  },
  dishDesc: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  dishFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  dishPrice: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  addBtn: {
    backgroundColor: '#ff4500',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ff4500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  dishStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#ff4500',
    borderRadius: 16,
    overflow: 'hidden',
  },
  dishStepBtnMinus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#fff',
  },
  dishStepVal: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#ff4500',
    minWidth: 20,
    textAlign: 'center',
  },
  dishStepBtnPlus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#ff4500',
  },
  floatingContainer: {
    position: 'absolute',
    right: 16,
    alignItems: 'flex-end',
    zIndex: 99,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  cartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cartTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  tableSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tableSelectorText: {
    color: '#00a01d',
    fontWeight: 'bold',
    fontSize: 14,
  },
  orderIdText: {
    color: '#777',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 16,
  },
  orderTypeContainer: {
    flexDirection: 'row',
    backgroundColor: '#fcfcfc',
    borderRadius: 8,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  orderTypeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 6,
    gap: 8,
  },
  orderTypeActive: {
    backgroundColor: '#ff3400',
  },
  orderTypeActiveText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  orderTypeInactiveText: {
    color: '#ccc',
    fontWeight: 'bold',
    fontSize: 14,
  },
  cartItemsScroll: {
    marginBottom: 16,
  },
  cartItemCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    padding: 12,
    marginBottom: 12,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  removeBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    zIndex: 10,
    backgroundColor: '#000',
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  cartItemTop: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  cartItemImg: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 12,
  },
  cartItemInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  cartItemName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  cartItemPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ff3400',
  },
  cartItemRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#f4f4f4',
    padding: 2,
  },
  stepBtnMinus: {
    backgroundColor: '#f2f2f2',
    padding: 2,
    borderRadius: 2,
  },
  stepBtnPlus: {
    backgroundColor: '#ff3400',
    padding: 2,
    borderRadius: 2,
  },
  stepVal: {
    fontSize: 12,
    color: '#000',
    width: 24,
    textAlign: 'center',
  },
  instructionInput: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: '#333',
  },
  placeOrderContainer: {
    paddingTop: 12,
  },
  placeOrderBtn: {
    backgroundColor: '#00a01d',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
  },
  placeOrderText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  payNowSecondaryBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  payNowSecondaryText: {
    color: '#666',
    fontSize: 13,
    fontWeight: '600',
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  navItem: {
    alignItems: 'center',
  },
  navText: {
    fontSize: 10,
    marginTop: 5,
    color: '#888',
  },
  tableStatusCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ffd0c7',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    shadowColor: '#ff4500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tableStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tableStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  tableStatusText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  tableActionBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ff4500',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 15,
  },
  tableActionText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ff4500',
  },
  scannerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  scannerModalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 400,
    overflow: 'hidden',
    padding: 20,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  cameraWrapper: {
    width: '100%',
    height: 280,
    borderRadius: 16,
    overflow: Platform.OS === 'ios' ? 'hidden' : 'visible',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
  },
  cameraPreview: {
    width: '100%',
    height: 280,
    borderRadius: Platform.OS === 'ios' ? 16 : 8,
  },
  cameraLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    zIndex: 2,
  },
  scanOverlayContainer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanTargetFrame: {
    width: 190,
    height: 190,
    borderWidth: 2.5,
    borderColor: '#ff4500',
    borderRadius: 14,
    backgroundColor: 'transparent',
  },
  scanInstructionText: {
    position: 'absolute',
    bottom: 12,
    color: '#fff',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  simulatorFallbackContainer: {
    width: '100%',
    backgroundColor: '#fdf8f5',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#ffd5cc',
  },
  simulatedViewfinder: {
    width: 120,
    height: 120,
    backgroundColor: '#fff',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ff4500',
    marginBottom: 12,
    shadowColor: '#ff4500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  simulatedScanFrame: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 0, 0.3)',
    borderRadius: 14,
    margin: 6,
  },
  simBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#eee',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  simBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#444',
  },
  simFallbackText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },
  webFallbackContainer: {
    width: '100%',
    height: 200,
    backgroundColor: '#fafafa',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    borderStyle: 'dashed',
  },
  webFallbackText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },
  enableCameraBtn: {
    marginTop: 12,
    backgroundColor: '#ff4500',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mockSelectorContainer: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 15,
  },
  mockLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    fontWeight: '600',
  },
  mockSelectorRow: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  mockTableBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  mockTableBtnActive: {
    backgroundColor: '#ff4500',
    borderColor: '#ff4500',
  },
  mockTableBtnText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  mockTableBtnTextActive: {
    color: '#fff',
  },
  verifyBtn: {
    backgroundColor: '#ff4500',
    borderRadius: 25,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifyBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
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
  },
  alertBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  alertBtnContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 10,
  },
  itemModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  itemModalContent: {
    backgroundColor: '#fff',
    borderRadius: 24,
    overflow: 'hidden',
    maxHeight: '85%',
    width: '100%',
  },
  itemModalHero: {
    width: '100%',
    height: 250,
    position: 'relative',
  },
  itemModalImg: {
    width: '100%',
    height: '100%',
  },
  itemModalBody: {
    padding: 20,
  },
  itemModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  itemModalDesc: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  itemModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fff',
  },
  itemModalAddBtn: {
    backgroundColor: '#ff3400',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  itemModalAddPrice: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#fff',
  },
  itemModalAddText: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#fff',
  },
  modalStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f4f4f4',
    padding: 4,
  },
  modalStepBtnMinus: {
    backgroundColor: '#f2f2f2',
    padding: 8,
    borderRadius: 6,
  },
  modalStepBtnPlus: {
    backgroundColor: '#ff3400',
    padding: 8,
    borderRadius: 6,
  },
  modalStepVal: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
    width: 32,
    textAlign: 'center',
  },
  stepBtnDisabled: {
    opacity: 0.5,
  },
  availBadge: {
    padding: 4,
    borderRadius: 10,
    backgroundColor: '#e6ffe6',
  },
  unavailBadge: {
    backgroundColor: '#ffe5e0',
  },
  availDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#00cc66',
  },
  availText: {
    fontSize: 12,
    color: '#00cc66',
    fontWeight: '600',
    marginLeft: 4,
  },
  unavailText: {
    color: '#ff4500',
  },
  unavailDot: {
    backgroundColor: '#ff4500',
  },
});
