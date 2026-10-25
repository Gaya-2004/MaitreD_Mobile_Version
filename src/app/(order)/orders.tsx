import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, Image, RefreshControl, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useNavigation } from 'expo-router';
import { orderApi, cateringOrderApi } from '../../services/apiService';
import { getFullImageUrl } from '../../constants/api';
import { useAuthStore, useCartStore, useOrderStore, useRestaurantStore } from '../../store';
import { useDineInSessionStore } from '../../store/useDineInSessionStore';
import BottomNavBar from '../../components/layout/BottomNavBar';
import { formatDateTime } from '../../utils/dateUtils';

const parseOrderTypeAndTable = (rawTypeInput: any, rawTableInput: any) => {
  const rawType = String(rawTypeInput || '').toUpperCase();
  const rawTable = String(rawTableInput || '').trim();
  const upperTable = rawTable.toUpperCase();

  if (rawType.includes('DELIV') || upperTable === 'DELIVERY') {
    return { mappedType: 'Delivery', tableNumber: null };
  }
  
  if (rawType.includes('TAKE') || rawType.includes('PICK') || upperTable.includes('TAKE') || upperTable.includes('PICK')) {
    return { mappedType: 'Takeaway', tableNumber: null };
  }

  let tableNumber: string | null = null;
  if (rawTable && !['DELIVERY', 'TAKE AWAY', 'TAKEAWAY', 'PICKUP', 'NULL', 'UNDEFINED'].includes(upperTable)) {
    if (/^\d+$/.test(rawTable)) {
      tableNumber = `T-${rawTable.padStart(2, '0')}`;
    } else if (rawTable.toLowerCase().startsWith('t-') || rawTable.toLowerCase().startsWith('t')) {
      tableNumber = rawTable.toUpperCase();
    } else {
      tableNumber = rawTable;
    }
  }

  return { mappedType: 'Dine In', tableNumber };
};

export default function Orders() {
  const router = useRouter();
  const navigation = useNavigation();
  const phone = useAuthStore(s => s.phone);
  const clearCart = useCartStore(s => s.clearCart);
  const addItem = useCartStore(s => s.addItem);
  const setOrderType = useCartStore(s => s.setOrderType);
  const [activeTab, setActiveTab] = useState('All');
  const [orders, setOrders] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  };
  const pastOrders = useOrderStore(s => s.pastOrders);
  const selectedOutlet = useRestaurantStore(s => s.selectedOutlet);
  const dineInSession = useDineInSessionStore();

  const loadOrders = async () => {
    setIsLoading(true);
    try {
      const userPhone = phone?.trim();
      const rawUserDigits = (userPhone || '').replace(/\D/g, '');
      const userLast10 = rawUserDigits.length >= 10 ? rawUserDigits.slice(-10) : rawUserDigits;

      let formattedOrders: any[] = [];

      // Fetch online customer orders for this specific phone from backend
      if (userPhone && rawUserDigits.length >= 10 && !['1234567890', '9876543210'].includes(userLast10)) {
        const [data1, data2] = await Promise.all([
          orderApi.getCustomerOrders(userPhone, 1).catch(() => []),
          orderApi.getCustomerOrders(userPhone, 2).catch(() => [])
        ]);

        let allData: any[] = [];
        if (Array.isArray(data1)) allData = [...allData, ...data1];
        if (Array.isArray(data2)) allData = [...allData, ...data2];

        if (allData.length > 0) {
          formattedOrders = allData.map((entry: any) => {
            const o = entry.order;
            const items = entry.items;
            const finalOrderId = o.orderId || `ORD-${String(o.id).padStart(6, '0')}`;
            const { mappedType, tableNumber } = parseOrderTypeAndTable(o.order_type, o.table_number);

            const normPayMethod = (o.payment_method || '').toLowerCase().replace(/[\s_-]/g, '');
            const isCounter = normPayMethod === 'payatcounter' || normPayMethod === 'counter';
            const isPaidStatus = (o.payment_status || '').toUpperCase() === 'PAID';

            return {
              id: finalOrderId,
              dbId: o.id,
              restaurant: o.restaurant_id === 2 ? 'MGR Nagar' : 'Mugalivakkam',
              restaurant_id: o.restaurant_id,
              bill_no: o.bill_no,
              dine_in_session_id: o.dine_in_session_id,
              date: o.created_at || '2000-01-01T00:00:00Z',
              status: o.status || 'Pending',
              payment_status: isPaidStatus ? 'Paid' : (o.payment_status || (isCounter ? 'Pay at Counter' : 'Pending')),
              payment_method: o.payment_method,
              table_number: tableNumber,
              items: items || [],
              total: o.total_amount || 0,
              image: items?.[0]?.image_url ? getFullImageUrl(items[0].image_url, items[0].name) : 'https://via.placeholder.com/150',
              order_type: mappedType,
              isCatering: false
            };
          });
        }
      }
      
      const { customerId } = useAuthStore.getState();
      if (customerId) {
        const cateringDataRes = await cateringOrderApi.getCateringOrders(customerId).catch(() => ({ data: [] }));
        const rawCatering = Array.isArray(cateringDataRes) ? cateringDataRes : (Array.isArray(cateringDataRes?.data) ? cateringDataRes.data : []);
        
        if (rawCatering.length > 0) {
          const cateringOrders = rawCatering.map((cOrder: any) => {
            return {
              id: `CAT-${String(cOrder.id).padStart(6, '0')}`,
              dbId: cOrder.id,
              restaurant: 'Data Udipi Catering',
              date: cOrder.created_at || cOrder.event_date || '2000-01-01T00:00:00Z',
              status: cOrder.order_status || 'Pending',
              payment_status: cOrder.payment_status || 'Pending',
              payment_method: 'Online',
              table_number: null,
              items: [{ name: cOrder.package_name, quantity: cOrder.guest_count, price: cOrder.package_price }],
              total: cOrder.total_amount || 0,
              paid_amount: cOrder.paid_amount || 0,
              balance_amount: cOrder.balance_amount || 0,
              image: 'https://via.placeholder.com/150', // Replace with catering icon if desired
              order_type: 'Catering',
              isCatering: true,
              payments: cOrder.payments || []
            };
          });
          formattedOrders = [...formattedOrders, ...cateringOrders];
        }
      }

      // Fallback to local pastOrders strictly if offline and matching user phone
      if (formattedOrders.length === 0 && userPhone && rawUserDigits.length >= 10 && !['1234567890', '9876543210'].includes(userLast10)) {
        const accountPastOrders = (pastOrders || []).filter((o: any) => {
          if (o.customer_phone) {
            const ordPhone = String(o.customer_phone).replace(/\D/g, '');
            return ordPhone.endsWith(userLast10) || ordPhone === rawUserDigits;
          }
          return false;
        });

        formattedOrders = accountPastOrders.map((o: any) => {
          const { mappedType, tableNumber } = parseOrderTypeAndTable(o.orderType || o.order_type, o.table_number);
          const normPayMethod = (o.payment_method || '').toLowerCase().replace(/[\s_-]/g, '');
          const isCounter = normPayMethod === 'payatcounter' || normPayMethod === 'counter';
          const isPaidStatus = (o.payment_status || '').toUpperCase() === 'PAID';

          return {
            id: o.orderId || `ORD-${String(o.dbOrderId || o.id || 0).padStart(6, '0')}`,
            dbId: o.dbOrderId || o.id,
            restaurant: o.restaurant_id === 2 ? 'MGR Nagar' : 'Mugalivakkam',
            restaurant_id: o.restaurant_id || o.restaurantId,
            bill_no: o.bill_no || o.billNo,
            dine_in_session_id: o.dine_in_session_id || o.sessionId,
            date: o.date || o.created_at || '2000-01-01T00:00:00Z',
            status: o.status || 'Pending',
            payment_status: isPaidStatus ? 'Paid' : (o.payment_status || (isCounter ? 'Pay at Counter' : 'Pending')),
            payment_method: o.payment_method,
            table_number: tableNumber,
            items: o.items || o.cart || [],
            total: o.total || 0,
            image: o.items?.[0]?.image ? getFullImageUrl(o.items[0].image, o.items[0].name) : 'https://via.placeholder.com/150',
            order_type: mappedType,
          };
        });
      }

      // Consolidate Dine In orders belonging to the same bill or dine-in session
      const consolidateDineInOrders = (orderList: any[]) => {
        const consolidated: any[] = [];
        const groupMap = new Map<string, any>();

        for (const ord of orderList) {
          if (ord.isCatering || ord.order_type !== 'Dine In' || (ord.status || '').toUpperCase() === 'CANCELLED') {
            consolidated.push(ord);
            continue;
          }

          let groupKey: string | null = null;
          if (ord.bill_no) {
            groupKey = `bill_${ord.restaurant_id || ord.restaurant}_${ord.bill_no}`;
          } else if (ord.dine_in_session_id) {
            groupKey = `sess_${ord.restaurant_id || ord.restaurant}_${ord.dine_in_session_id}`;
          } else if (ord.table_number && (ord.payment_status || '').toUpperCase() !== 'PAID') {
            groupKey = `unpaid_table_${ord.restaurant_id || ord.restaurant}_${ord.table_number}`;
          }

          if (!groupKey) {
            consolidated.push(ord);
            continue;
          }

          if (groupMap.has(groupKey)) {
            const existing = groupMap.get(groupKey);

            // Merge items: combine quantities for matching menu items
            const existingItems = [...(existing.items || [])];
            const incomingItems = Array.isArray(ord.items) ? ord.items : [];

            for (const newItem of incomingItems) {
              const matchIdx = existingItems.findIndex((it: any) => {
                const sameId = (it.menu_item_id && newItem.menu_item_id && it.menu_item_id === newItem.menu_item_id) ||
                               (it.id && newItem.id && it.id === newItem.id);
                const sameName = it.name && newItem.name && it.name.trim().toLowerCase() === newItem.name.trim().toLowerCase();
                return sameId || sameName;
              });

              if (matchIdx >= 0) {
                existingItems[matchIdx] = {
                  ...existingItems[matchIdx],
                  quantity: (Number(existingItems[matchIdx].quantity) || 1) + (Number(newItem.quantity) || 1),
                };
              } else {
                existingItems.push(newItem);
              }
            }
            existing.items = existingItems;

            // Recalculate combined total
            const itemsSum = existingItems.reduce(
              (sum: number, it: any) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1),
              0
            );
            existing.total = Math.max(Number(existing.total) || 0, Number(ord.total) || 0, itemsSum);

            if (!existing.bill_no && ord.bill_no) existing.bill_no = ord.bill_no;
            if (!existing.dine_in_session_id && ord.dine_in_session_id) existing.dine_in_session_id = ord.dine_in_session_id;

            const curStatus = (existing.status || '').toUpperCase();
            const newStatus = (ord.status || '').toUpperCase();
            if (['PREPARING', 'READY', 'CONFIRMED', 'PENDING'].includes(newStatus)) {
              existing.status = ord.status;
            } else if (curStatus !== 'SERVED' && newStatus === 'SERVED') {
              existing.status = 'SERVED';
            }

            if ((ord.payment_status || '').toUpperCase() === 'PAID') {
              existing.payment_status = 'Paid';
            }

            if ((!existing.image || existing.image.includes('placeholder')) && existingItems[0]) {
              const firstIt = existingItems[0];
              existing.image = firstIt.image_url ? getFullImageUrl(firstIt.image_url, firstIt.name) : (firstIt.image || existing.image);
            }
          } else {
            groupMap.set(groupKey, ord);
            consolidated.push(ord);
          }
        }

        return consolidated;
      };

      formattedOrders = consolidateDineInOrders(formattedOrders);

      // Merge active ongoing dine-in order under ONE single order ID only if truly active
      const activeRounds = (dineInSession.orderRounds || []).filter(
        (r: any) => (r.status || '').toUpperCase() !== 'CANCELLED'
      );
      const isDineInActuallyActive = dineInSession.isActive && dineInSession.activeOrderId && (activeRounds.length > 0 || (dineInSession.orderRounds || []).length === 0) && Number(dineInSession.totalAmount || 0) > 0;

      if (isDineInActuallyActive) {
        // Collect all indices of orders that belong to this active session
        const matchingIndices: number[] = [];
        formattedOrders.forEach((o: any, idx: number) => {
          if ((o.status || '').toUpperCase() === 'CANCELLED') return;
          const isSameSession = Boolean(dineInSession.sessionDbId && o.dine_in_session_id && Number(o.dine_in_session_id) === Number(dineInSession.sessionDbId));
          const isSameOrder = o.id === dineInSession.activeOrderId || String(o.dbId) === String(dineInSession.activeDbOrderId);
          const isRoundOrder = (dineInSession.orderRounds || []).some((r: any) => String(r.id) === String(o.dbId) || String(r.orderId) === String(o.id));
          const isSameTableUnpaid = o.order_type === 'Dine In' && o.table_number && dineInSession.tableNumber && o.table_number === dineInSession.tableNumber && (o.payment_status || '').toUpperCase() !== 'PAID';

          if (isSameSession || isSameOrder || isRoundOrder || isSameTableUnpaid) {
            matchingIndices.push(idx);
          }
        });

        let sessionBillNo = null;
        for (const idx of matchingIndices) {
          if (formattedOrders[idx].bill_no) {
            sessionBillNo = formattedOrders[idx].bill_no;
            break;
          }
        }

        const primaryMatch = matchingIndices.length > 0 ? formattedOrders[matchingIndices[0]] : null;

        const activeOrderCard = {
          id: dineInSession.activeOrderId || (primaryMatch ? primaryMatch.id : 'ORD-ACTIVE'),
          dbId: dineInSession.activeDbOrderId || (primaryMatch ? primaryMatch.dbId : null),
          restaurant: (primaryMatch ? primaryMatch.restaurant : null) || selectedOutlet?.name || 'Data Udipi',
          restaurant_id: (primaryMatch ? primaryMatch.restaurant_id : null) || selectedOutlet?.restaurant_id || 1,
          bill_no: sessionBillNo,
          dine_in_session_id: dineInSession.sessionDbId,
          date: new Date().toISOString(),
          status: 'PREPARING',
          payment_status: 'Pay Later',
          table_number: dineInSession.tableNumber,
          items: (dineInSession.orderedItems && dineInSession.orderedItems.length > 0) ? dineInSession.orderedItems : (primaryMatch ? primaryMatch.items : []),
          total: Number(dineInSession.totalAmount || 0) > 0 ? dineInSession.totalAmount : (primaryMatch ? primaryMatch.total : 0),
          image: dineInSession.orderedItems?.[0]?.image ? getFullImageUrl(dineInSession.orderedItems[0].image, dineInSession.orderedItems[0].name) : (primaryMatch ? primaryMatch.image : 'https://via.placeholder.com/150'),
          order_type: 'Dine In',
          isOngoingDineIn: true,
        };

        formattedOrders = formattedOrders.filter((_, idx) => !matchingIndices.includes(idx));
        formattedOrders.unshift(activeOrderCard);
      }

      // Helper to compute timestamps safely
      const getOrderTime = (o: any): number => {
        if (o.isOngoingDineIn) return Date.now();
        if (!o.date) return 0;
        const t = new Date(o.date).getTime();
        return isNaN(t) ? 0 : t;
      };

      // Check whether order requires payment / is unpaid
      const isOrderUnpaid = (o: any): boolean => {
        const statusUpper = (o.status || '').toUpperCase();
        if (statusUpper === 'CANCELLED') return false;
        if (o.isOngoingDineIn) return true;

        if (o.isCatering) {
          const payStatus = (o.payment_status || '').toUpperCase();
          const balance = Number(o.balance_amount || 0);
          return payStatus !== 'PAID' && (payStatus === 'PARTIALLY_PAID' || balance > 0 || payStatus === 'PENDING');
        }

        const payStatusUpper = (o.payment_status || '').toUpperCase();
        return payStatusUpper !== 'PAID';
      };

      const maxOrderTime = formattedOrders.reduce((max, o) => Math.max(max, getOrderTime(o)), 0);

      const getOrderPriority = (o: any): number => {
        const statusUpper = (o.status || '').toUpperCase();
        if (statusUpper === 'CANCELLED') return 4;

        if (o.isOngoingDineIn) return 0;

        const unpaid = isOrderUnpaid(o);
        const isLatest = getOrderTime(o) === maxOrderTime && maxOrderTime > 0;

        // Unpaid orders and the Last Order placed come to the front of the stack
        if (unpaid || isLatest) return 1;

        // Active in-progress orders
        const isActive = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'RIDER_ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ON_THE_WAY'].includes(statusUpper);
        if (isActive) return 2;

        // Completed historical orders
        return 3;
      };

      // Multi-tier sort: Priority first, then newest orders first within each priority tier
      formattedOrders.sort((a, b) => {
        const prioA = getOrderPriority(a);
        const prioB = getOrderPriority(b);
        if (prioA !== prioB) {
          return prioA - prioB;
        }
        return getOrderTime(b) - getOrderTime(a);
      });

      setOrders(formattedOrders);
    } catch (e) {
      console.error("Error loading local orders", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadOrders();
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      if (activeTab === 'All') return true;
      
      const status = (order.status || '').toUpperCase();
      const isPaid = (order.payment_status || '').toUpperCase() === 'PAID';
      const isCancelled = status === 'CANCELLED';

      if (activeTab === 'Ongoing') {
        if (isCancelled) return false;
        if (order.isOngoingDineIn) return true;
        if (order.order_type === 'Dine In') {
          return !isPaid || ['CONFIRMED', 'PENDING', 'PREPARING', 'READY'].includes(status);
        }
        if (['CONFIRMED', 'PENDING', 'PREPARING', 'READY', 'RIDER_ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ON_THE_WAY'].includes(status)) {
          return true;
        }
        if (!isPaid && !order.isCatering) return true;
        if (order.isCatering && (order.payment_status || '').toUpperCase() === 'PARTIALLY_PAID') return true;
        return false;
      }

      if (activeTab === 'Delivered' || activeTab === 'Completed') {
        if (isCancelled) return false;
        if (order.order_type === 'Dine In') {
          return isPaid && ['SERVED', 'COMPLETED'].includes(status);
        }
        return ['SERVED', 'COMPLETED', 'DELIVERED'].includes(status) && isPaid;
      }

      if (activeTab === 'Cancelled' || activeTab === 'CANCELLED') {
        return isCancelled;
      }
      
      return status === activeTab.toUpperCase();
    });
  }, [orders, activeTab]);

  const handleReorder = (order: any) => {
    clearCart();
    if (order.order_type === 'Take Away') setOrderType('Take Away');
    else if (order.order_type === 'Delivery') setOrderType('Delivery');
    else setOrderType('Dine In');

    if (Array.isArray(order.items)) {
      order.items.forEach((item: any) => {
        addItem({
          id: String(item.menu_item_id || item.id),
          name: item.name || 'Item',
          price: item.price || 0,
          quantity: item.quantity || 1,
          image: item.image_url || item.image || '',
          category: item.category || 'General',
        });
      });
    }
    router.replace('/checkout');
  };

  const handleOrderPress = (order: any) => {
    const rawStatus = (order.status || '').toUpperCase();
    const isCompleted = ['COMPLETED', 'SERVED', 'DELIVERED', 'CANCELLED'].includes(rawStatus);

    // If it's a previous/historical order or user clicked in Completed/Delivered/Cancelled tab
    if (isCompleted || activeTab === 'Completed' || activeTab === 'Delivered' || activeTab === 'Cancelled') {
      router.push({
        pathname: '/order-details',
        params: {
          orderId: String(order.dbOrderId || order.dbId || order.id || ''),
          restaurantId: String(order.restaurant_id || ''),
          orderJson: JSON.stringify(order),
        }
      });
      return;
    }

    if (order.order_type === 'Delivery') {
      router.push({
        pathname: '/delivery-success',
        params: {
          dbOrderId: String(order.dbOrderId || order.dbId || ''),
          orderId: order.id,
          orderType: 'Delivery',
          total: String(order.total || 0),
          paymentMethod: order.payment_method || 'Cash',
          phone: phone || '',
          cart: typeof order.items === 'string' ? order.items : JSON.stringify(order.items || []),
        }
      });
    } else if (order.order_type === 'Takeaway' || order.order_type === 'Take Away') {
      router.push({
        pathname: '/order-success',
        params: {
          dbOrderId: String(order.dbOrderId || order.dbId || ''),
          orderId: order.id,
          orderType: 'Takeaway',
          tableNumber: 'Take Away',
          total: String(order.total || 0),
          paymentMethod: order.payment_method || 'UPI',
          phone: phone || '',
          cart: typeof order.items === 'string' ? order.items : JSON.stringify(order.items || []),
        }
      });
    } else {
      const isCancelled = (order.status || '').toUpperCase() === 'CANCELLED';
      const isUnpaid = (order.payment_status || '').toUpperCase() !== 'PAID';
      if (!isCancelled && (isUnpaid || order.isOngoingDineIn)) {
        router.push({ 
          pathname: '/track-order', 
          params: { 
            dbOrderId: String(order.dbOrderId || order.dbId || ''),
            orderId: order.id,
            orderType: 'Dine In',
            tableNumber: order.table_number || 'T-01',
          } 
        });
      } else {
        router.push({
          pathname: '/order-details',
          params: {
            orderId: String(order.dbOrderId || order.dbId || order.id || ''),
            restaurantId: String(order.restaurant_id || ''),
            orderJson: JSON.stringify(order),
          }
        });
      }
    }
  };

  const handlePayBalance = (order: any) => {
    router.push({
      pathname: '/catering-balance-payment',
      params: {
        orderId: String(order.dbId),
        balanceAmount: String(order.balance_amount || 0),
        packageName: Array.isArray(order.items) && order.items[0] ? order.items[0].name : 'Catering Package'
      }
    });
  };

  const getDisplayStatus = (status: string, type: string) => {
    const s = status?.toUpperCase();
    if (s === 'CANCELLED') return 'Cancelled';
    if (s === 'CONFIRMED') return 'Confirmed';
    if (s === 'PREPARING') return 'Preparing';
    if (s === 'READY') {
      if (type === 'Take Away') return 'Ready to Pick up';
      if (type === 'Delivery') return 'Ready for Delivery';
      return 'Ready to Serve';
    }
    if (s === 'SERVED' || s === 'COMPLETED' || s === 'DELIVERED') {
      if (type === 'Take Away') return 'Picked Up';
      if (type === 'Delivery') return 'Delivered';
      return 'Served';
    }
    return status;
  };

  const formatDate = (isoString: string) => {
    return formatDateTime(isoString);
  };


  const keyExtractor = useCallback((item: any) => String(item.id || item.dbId), []);

  const renderOrderItem = useCallback(({ item: order }: { item: any }) => {
    const isDineIn = order.order_type === 'Dine In';
    const isCatering = order.isCatering;
    const normPayMethod = (order.payment_method || '').toLowerCase().replace(/[\s_-]/g, '');
    const isCounter = normPayMethod === 'payatcounter' || normPayMethod === 'counter';
    const isPartiallyPaid = (order.payment_status || '').toUpperCase() === 'PARTIALLY_PAID';
    const isPaid = (order.payment_status || '').toUpperCase() === 'PAID';
    const isCancelled = (order.status || '').toUpperCase() === 'CANCELLED';
    const isUnpaidDineIn = isDineIn && (!isPaid || order.isOngoingDineIn) && !isCancelled;
    const isUnpaidNonCatering = !isPaid && !isCatering && !isCancelled;

    return (
      <TouchableOpacity 
        style={styles.orderCard}
        onPress={() => {
          if (order.isCatering) return; // Ignore full card press for catering, use buttons instead
          handleOrderPress(order);
        }}
      >
        <View style={styles.orderHeader}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.restaurantName} numberOfLines={1}>{order.restaurant}</Text>
            <Text style={styles.orderDate} numberOfLines={1}>{formatDate(order.date)}</Text>
          </View>
          <View style={[
            styles.statusBadge, 
            order.status?.toUpperCase() === 'CANCELLED' ? styles.statusCancelled : styles.statusDelivered
          ]}>
            <Text style={[
              styles.statusText,
              order.status?.toUpperCase() === 'CANCELLED' ? styles.statusTextCancelled : styles.statusTextDelivered
            ]}>{getDisplayStatus(order.status, order.order_type)}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 15, flexWrap: 'wrap' }}>
          {isDineIn ? (
            <View style={styles.infoBadge}>
              <Text style={styles.infoBadgeLabel}>Bill No</Text>
              <Text style={styles.infoBadgeValue}>
                {order.bill_no ? `#${order.bill_no}` : `#${String(order.dbId || order.id).replace(/\D/g, '')}`}
              </Text>
            </View>
          ) : (
            <View style={styles.infoBadge}>
              <Text style={styles.infoBadgeLabel}>Order ID</Text>
              <Text style={styles.infoBadgeValue}>{order.id}</Text>
            </View>
          )}
          <View style={styles.infoBadge}>
            <Text style={styles.infoBadgeLabel}>Type</Text>
            <Text style={styles.infoBadgeValue}>
              {isDineIn
                ? `Dine In${order.table_number ? ` (${order.table_number})` : ''}`
                : order.order_type}
            </Text>
          </View>
          <View style={[styles.infoBadge, isCancelled ? { backgroundColor: '#fee2e2' } : isPaid ? { backgroundColor: '#e8f5e9' } : (isPartiallyPaid ? {backgroundColor: '#e3f2fd'} : { backgroundColor: '#fff3e0' })]}>
            <Text style={styles.infoBadgeLabel}>Payment</Text>
            <Text style={[styles.infoBadgeValue, { color: isCancelled ? '#dc2626' : isPaid ? '#16a34a' : (isPartiallyPaid ? '#0284c7' : '#ff4500'), fontWeight: 'bold' }]}>
              {isCancelled ? 'Cancelled' : isPaid ? 'Paid' : (isPartiallyPaid ? 'Partially Paid' : (order.order_type === 'Delivery' ? 'Cash on Delivery' : (isCounter ? 'Pay at Counter' : 'Pay Later')))}
            </Text>
          </View>
        </View>

        <View style={styles.orderDetails}>
          {order.image && order.image !== 'https://via.placeholder.com/150' ? (
            <Image source={{ uri: order.image }} style={styles.orderImage} />
          ) : (
            <View style={[styles.orderImage, { backgroundColor: '#fff0eb', alignItems: 'center', justifyContent: 'center' }]}>
              {isCatering ? (
                <Ionicons name="people-outline" size={26} color="#ff4500" />
              ) : (
                <Ionicons name="restaurant-outline" size={26} color="#ff4500" />
              )}
            </View>
          )}
          <View style={styles.orderInfo}>
            <Text style={styles.orderItems} numberOfLines={2}>
              {isCatering && Array.isArray(order.items) && order.items[0]
                ? `${order.items[0].name} (x${order.items[0].quantity} Guests)`
                : Array.isArray(order.items) 
                ? order.items.map((i: any) => `${i.quantity || 1}x ${i.name || 'Item'}`).join(', ') 
                : (typeof order.items === 'string' ? order.items : 'Items')}
            </Text>
            <Text style={styles.orderPrice}>Rs. {order.total}</Text>
            {isCatering && isPartiallyPaid && (
              <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                Paid: Rs. {order.paid_amount || 0} • Bal: Rs. {order.balance_amount || 0}
              </Text>
            )}
          </View>
          {isCatering && isPartiallyPaid ? (
            <TouchableOpacity 
              style={[styles.reorderBtn, { backgroundColor: '#3395FF', borderColor: '#3395FF', minWidth: 100, alignItems: 'center', justifyContent: 'center' }]} 
              onPress={(e) => {
                e.stopPropagation();
                handlePayBalance(order);
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.reorderText, { color: '#ffffff', fontWeight: 'bold' }]}>Pay Balance</Text>
            </TouchableOpacity>
          ) : isUnpaidDineIn ? (
            <TouchableOpacity 
              style={[styles.reorderBtn, { backgroundColor: '#ff4500', borderColor: '#ff4500', minWidth: 100, alignItems: 'center', justifyContent: 'center' }]} 
              onPress={() => handleOrderPress(order)}
              activeOpacity={0.8}
            >
              <Text style={[styles.reorderText, { color: '#ffffff', fontWeight: 'bold' }]}>Track / Pay</Text>
            </TouchableOpacity>
          ) : (order.order_type === 'Delivery' || order.order_type === 'Takeaway' || order.order_type === 'Take Away') && !['COMPLETED', 'SERVED', 'DELIVERED', 'CANCELLED'].includes((order.status || '').toUpperCase()) ? (
            <TouchableOpacity 
              style={[styles.reorderBtn, { backgroundColor: '#ff4500', borderColor: '#ff4500', minWidth: 100, alignItems: 'center', justifyContent: 'center' }]} 
              onPress={() => handleOrderPress(order)}
              activeOpacity={0.8}
            >
              <Text style={[styles.reorderText, { color: '#ffffff', fontWeight: 'bold' }]}>Track Order</Text>
            </TouchableOpacity>
          ) : isUnpaidNonCatering ? (
            <TouchableOpacity 
              style={[styles.reorderBtn, { backgroundColor: '#ff4500', borderColor: '#ff4500', minWidth: 100, alignItems: 'center', justifyContent: 'center' }]} 
              onPress={() => handleOrderPress(order)}
              activeOpacity={0.8}
            >
              <Text style={[styles.reorderText, { color: '#ffffff', fontWeight: 'bold' }]}>Track / Pay</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={[styles.reorderBtn, { backgroundColor: '#fff', borderColor: '#ff4500', minWidth: 100, alignItems: 'center', justifyContent: 'center' }]} 
              onPress={() => {
                if (isCatering) {
                  router.push({ pathname: '/catering-order-details', params: { orderId: order.dbId } });
                } else {
                  handleOrderPress(order);
                }
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.reorderText, { color: '#ff4500', fontWeight: 'bold' }]}>View Details</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Payment History for Catering */}
        {isCatering && order.payments && order.payments.length > 0 && (
          <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0' }}>
            <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#444', marginBottom: 8 }}>Payment History</Text>
            {order.payments.map((p: any) => (
              <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, backgroundColor: '#f9f9f9', padding: 8, borderRadius: 6 }}>
                <View>
                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#333' }}>{p.payment_type} ({p.payment_method})</Text>
                  <Text style={{ fontSize: 10, color: '#777', marginTop: 2 }}>Txn: {p.transaction_id || 'N/A'}</Text>
                  <Text style={{ fontSize: 10, color: '#777' }}>{formatDate(p.created_at)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: p.payment_status === 'SUCCESS' ? '#16a34a' : '#ff4500' }}>Rs. {p.amount}</Text>
                  <Text style={{ fontSize: 10, color: p.payment_status === 'SUCCESS' ? '#16a34a' : '#ff4500', marginTop: 2 }}>{p.payment_status}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </TouchableOpacity>
    );
  }, [router]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle='dark-content' backgroundColor='#fff' />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backBtn} 
          onPress={() => router.canGoBack() ? router.back() : router.replace('/home')}
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Orders</Text>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterWrapper}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContainer}
        >
          {['All', 'Ongoing', 'Completed', 'Cancelled'].map(tab => {
            const isSelected = activeTab === tab || (activeTab === 'Delivered' && tab === 'Completed');
            return (
              <TouchableOpacity 
                key={tab} 
                style={[styles.filterBtn, isSelected && styles.filterBtnActive]}
                onPress={() => setActiveTab(tab === 'Completed' ? 'Delivered' : tab)}
              >
                <Text style={[styles.filterText, isSelected && styles.filterTextActive]}>{tab}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 }}>
          <ActivityIndicator size="large" color="#ff4500" />
          <Text style={{ marginTop: 10, color: '#666' }}>Loading your orders...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={keyExtractor}
          renderItem={renderOrderItem}
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== 'web'}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ff4500']} />}
          ListEmptyComponent={
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 80 }}>
              <Ionicons name="receipt-outline" size={54} color="#ccc" />
              <Text style={{ marginTop: 12, color: '#888', fontSize: 16 }}>No orders found</Text>
            </View>
          }
        />
      )}

      {/* Bottom Navigation */}
      <BottomNavBar activeTab="orders" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
    
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
  },
  backBtn: {
    marginRight: 15,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  filterWrapper: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fff',
    gap: 10,
    alignItems: 'center',
  },
  filterBtn: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  filterBtnActive: {
    backgroundColor: '#ff4500',
    borderColor: '#ff4500',
  },
  filterText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#fff',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 120,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  restaurantName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  orderDate: {
    fontSize: 12,
    color: '#888',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusDelivered: {
    backgroundColor: '#e6ffe6',
  },
  statusCancelled: {
    backgroundColor: '#ffe6e6',
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusTextDelivered: {
    color: '#00cc66',
  },
  statusTextCancelled: {
    color: '#ff4500',
  },
  orderDetails: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orderImage: {
    width: 60,
    height: 60,
    borderRadius: 10,
    marginRight: 15,
  },
  orderInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  orderItems: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  orderPrice: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  reorderBtn: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ff4500',
  },
  reorderText: {
    color: '#ff4500',
    fontSize: 14,
    fontWeight: 'bold',
  },
  infoBadge: {
    backgroundColor: '#f9f9f9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  infoBadgeLabel: {
    fontSize: 10,
    color: '#888',
    marginBottom: 4,
  },
  infoBadgeValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000',
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 15,
    backgroundColor: '#fff',
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
  }
});
