import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, Platform, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantStore } from '../../store';
import { orderApi } from '../../services/apiService';
import { formatDateTime } from '../../utils/dateUtils';

const getAssetBase64 = async (assetRequire: any) => {
  try {
    const source = Image.resolveAssetSource(assetRequire);
    if (!source || !source.uri) return '';

    const uri = source.uri;
    if (Platform.OS === 'web') {
      return uri;
    }

    const isPng = uri.toLowerCase().includes('.png');
    const mimeType = isPng ? 'image/png' : 'image/jpeg';

    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      const ext = isPng ? 'png' : 'jpg';
      const localPath = `${cacheDir}temp_asset_${Date.now()}.${ext}`;
      const result = await FileSystem.downloadAsync(uri, localPath);
      const base64 = await FileSystem.readAsStringAsync(result.uri, {
        encoding: 'base64',
      });
      try {
        await FileSystem.deleteAsync(localPath, { idempotent: true });
      } catch { }
      return `data:${mimeType};base64,${base64}`;
    } else {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });
      return `data:${mimeType};base64,${base64}`;
    }
  } catch (err) {
    console.warn("Could not load asset as base64", err);
    return Image.resolveAssetSource(assetRequire)?.uri || '';
  }
};

export default function InvoiceScreen() {
  const { selectedOutlet } = useRestaurantStore();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [downloading, setDownloading] = useState(false);
  const branchName = selectedOutlet?.name || 'Data Udipi — Mugalivakkam';
  const branchAddress = selectedOutlet?.address || 'Mount-Poonamallee Road, Mugalivakkam, Chennai 600125';
  const [orderData, setOrderData] = useState<any>(null);
  const [loadingOrder, setLoadingOrder] = useState(Boolean(params.dbOrderId));

  useEffect(() => {
    const dbOrderId = (params.dbOrderId as string | undefined) || (params.orderId ? (params.orderId as string).replace(/\D/g, '') : undefined);
    if (!dbOrderId) return;

    const restaurantId = Number(params.restaurantId || selectedOutlet?.restaurant_id || selectedOutlet?.id || 1);

    orderApi.getOrderDetails(dbOrderId, restaurantId)
      .then(data => setOrderData(data))
      .catch(error => {
        console.warn('Failed to load invoice order data', error);
      })
      .finally(() => setLoadingOrder(false));
  }, [params.dbOrderId, params.orderId, selectedOutlet]);

  const backendOrder = orderData?.order || {};
  const currentBillNo = backendOrder.bill_no || (params.billNo as string) || null;
  const orderId = (params.orderId as string) || (backendOrder.id ? `ORD-${backendOrder.id}` : 'Invoice');

  const orderItems: any[] = Array.isArray(orderData?.items) ? orderData.items : [];
  let cartData: any[] = [];
  try {
    if (params.cartData) {
      const parsed = typeof params.cartData === 'string' ? JSON.parse(params.cartData) : params.cartData;
      if (Array.isArray(parsed)) {
        cartData = parsed;
      }
    }
  } catch (e) {
    console.error("Error parsing cart data", e);
  }
  const effectiveItems: any[] = orderItems.length > 0 ? orderItems : cartData;

  const subtotalVal = effectiveItems.length > 0
    ? effectiveItems.reduce((sum: number, item: any) => sum + (Number(item?.price || item?.unit_price || 0) * Number(item?.quantity || item?.qty || 1)), 0)
    : (parseFloat((params.subtotal as string) || '0') || 0);

  const discountAmountVal = Number(backendOrder.discount_amount ?? (parseFloat((params.discountAmount as string) || '0') || 0)) || 0;
  const deliveryFeeVal = Number(backendOrder.delivery_fee || (parseFloat((params.deliveryFee as string) || '0') || 0)) || 0;
  const packagingFeeVal = Number(backendOrder.packaging_fee || (parseFloat((params.packagingFee as string) || '0') || 0)) || 0;
  const tipAmountVal = Number(backendOrder.tip_amount || (parseFloat((params.tipAmount as string) || '0') || 0)) || 0;
  const gstAmountVal = Number(backendOrder.gst_amount || (parseFloat((params.gstAmount as string) || '0') || 0)) || 0;

  // Authoritative total calculated from items and fees
  const calculatedTotal = Math.max(0, subtotalVal + deliveryFeeVal + packagingFeeVal + tipAmountVal + gstAmountVal - discountAmountVal);
  const fallbackTotal = Number(backendOrder.total_amount ?? (parseFloat((params.finalTotal as string) || '0') || 0)) || 0;
  const finalTotalVal = calculatedTotal > 0 ? calculatedTotal : fallbackTotal;

  const rawDeliveryAddress = backendOrder.delivery_address_snapshot || backendOrder.delivery_address || params.deliveryAddress;
  const deliveryAddressStr = rawDeliveryAddress
    ? (typeof rawDeliveryAddress === 'string' ? rawDeliveryAddress : (rawDeliveryAddress.address || rawDeliveryAddress.full_address || ''))
    : '';
  const discountCodeStr = String((params.discountCode as string) || backendOrder.discount_code || '');
  const mobileNumber = String((params.mobileNumber as string) || backendOrder.customer_phone || 'WALK-IN');
  const customerName = String((params.customerName as string) || (mobileNumber === 'WALK-IN' ? 'WALK-IN' : 'REGISTERED'));
  const paymentMethod = String(backendOrder.payment_method || (params.paymentMethod as string) || 'UPI');
  const orderType = String((params.orderType as string) || backendOrder.order_type || 'Dine In');

  const totalQty = effectiveItems.reduce((acc: number, item: any) => acc + (parseInt(item?.quantity || item?.qty || 1, 10) || 1), 0);
  const invoiceDate = backendOrder.created_at || backendOrder.delivered_at;
  const formattedDate = invoiceDate ? formatDateTime(invoiceDate) : 'Date unavailable';

  // No GST / CGST / SGST is deducted or added unless explicitly returned in gstAmountVal
  const totalGstValFromOrder = gstAmountVal > 0 ? gstAmountVal : 0;
  const netTaxableVal = Math.max(0, finalTotalVal - totalGstValFromOrder);
  const cgstVal = totalGstValFromOrder / 2;
  const sgstVal = cgstVal;
  const totalGstVal = totalGstValFromOrder;

  const subtotal = subtotalVal.toFixed(2);
  const discountAmount = discountAmountVal.toFixed(2);
  const finalTotal = finalTotalVal.toFixed(2);
  const netTaxable = netTaxableVal.toFixed(2);
  const cgst = cgstVal.toFixed(2);
  const sgst = sgstVal.toFixed(2);
  const totalGst = totalGstVal.toFixed(2);

  const tableNumber = String(backendOrder.table_number || (params.tableNumber as string) || (params.table as string) || '');



  const generatePDF = async () => {
    setDownloading(true);
    try {
      const logoBase64 = await getAssetBase64(require('../../../assets/images/udupi-banner.png'));
      const qrCodeUrl = paymentMethod.toUpperCase() === 'UPI'
        ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=upi://pay?pa=dataudipi@upi%26pn=DataUdipi%26am=${finalTotal}%26cu=INR`
        : `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=CashPaymentConfirmed`;

      let itemsHtml = '';
      effectiveItems.forEach((item) => {
        const name = String(item?.name || item?.itemName || 'ITEM').toUpperCase();
        const price = (parseFloat(item?.price || item?.unit_price || 0) || 0).toFixed(2);
        const qty = String(parseInt(item?.quantity || item?.qty || 1, 10) || 1).padStart(2, '0');
        const netAmt = ((parseFloat(item?.price || item?.unit_price || 0) || 0) * (parseInt(item?.quantity || item?.qty || 1, 10) || 1)).toFixed(2);

        itemsHtml += `
          <tr>
            <td class="text-left font-medium">${name}</td>
            <td class="text-right">₹${price}</td>
            <td class="text-center">${qty}</td>
            <td class="text-right font-bold">₹${netAmt}</td>
          </tr>
        `;
      });

      const invoiceTitle = totalGstValFromOrder > 0 ? 'TAX INVOICE' : 'RETAIL INVOICE';
      const cleanBranchTitle = (branchName || '').includes(' — ') ? branchName.split(' — ')[0].trim() : (branchName || '').trim();

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${invoiceTitle} - ${currentBillNo || orderId}</title>
        <style>
          @page {
            size: auto;
            margin: 10mm 12mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #1e293b;
            background-color: #ffffff;
            margin: 0;
            padding: 12px;
            display: flex;
            justify-content: center;
          }
          .invoice-card {
            width: 100%;
            max-width: 500px;
            margin: 0 auto;
            padding: 20px 24px;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          }
          .banner-tag {
            background: linear-gradient(135deg, #ff5722 0%, #e64a19 100%);
            color: #ffffff;
            text-align: center;
            padding: 7px 10px;
            border-radius: 5px;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 2.5px;
            text-transform: uppercase;
            margin-bottom: 14px;
          }
          .brand-header {
            text-align: center;
            margin-bottom: 12px;
          }
          .brand-logo-img {
            max-width: 200px;
            height: 44px;
            object-fit: contain;
            margin-bottom: 4px;
          }
          .outlet-name {
            font-size: 13px;
            font-weight: 800;
            color: #0f172a;
            margin-bottom: 3px;
          }
          .outlet-address {
            font-size: 11px;
            color: #475569;
            line-height: 1.4;
            max-width: 90%;
            margin: 0 auto 5px auto;
          }
          .company-details {
            font-size: 10px;
            color: #64748b;
            line-height: 1.35;
          }
          .company-gstin {
            font-size: 10.5px;
            font-weight: 700;
            color: #334155;
            margin-top: 2px;
          }
          .divider-dashed {
            border: none;
            border-top: 1px dashed #cbd5e1;
            margin: 12px 0;
          }
          .invoice-type-badge {
            text-align: center;
            margin: 8px 0;
          }
          .invoice-type-text {
            display: inline-block;
            font-size: 12px;
            font-weight: 800;
            letter-spacing: 1.5px;
            color: #0f172a;
            text-transform: uppercase;
            padding: 3px 12px;
            border: 1px solid #0f172a;
            border-radius: 4px;
          }
          .meta-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            line-height: 1.6;
            margin: 8px 0;
          }
          .meta-table td {
            vertical-align: top;
            padding: 1px 0;
          }
          .meta-label {
            color: #64748b;
            font-weight: 500;
          }
          .meta-val {
            color: #0f172a;
            font-weight: 600;
          }
          .bill-highlight {
            color: #16a34a;
            font-weight: 800;
            font-size: 12px;
          }
          .delivery-note {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 6px 10px;
            font-size: 10.5px;
            color: #334155;
            margin: 6px 0;
          }
          table.items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 8px 0;
            font-size: 11px;
          }
          table.items-table th {
            padding: 7px 4px;
            font-weight: 700;
            color: #0f172a;
            border-top: 1.5px solid #0f172a;
            border-bottom: 1.5px solid #0f172a;
            text-transform: uppercase;
            font-size: 10px;
            letter-spacing: 0.5px;
          }
          table.items-table td {
            padding: 6px 4px;
            color: #1e293b;
            border-bottom: 1px dashed #e2e8f0;
          }
          table.items-table tr:last-child td {
            border-bottom: 1.5px solid #0f172a;
          }
          .text-left { text-align: left; }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .font-medium { font-weight: 600; }
          .font-bold { font-weight: 700; }
          .totals-block {
            margin-top: 8px;
            font-size: 11px;
          }
          .totals-row {
            display: flex;
            justify-content: space-between;
            padding: 3px 0;
            color: #334155;
          }
          .totals-row.discount {
            color: #16a34a;
            font-weight: 700;
          }
          .grand-total-strip {
            margin-top: 8px;
            padding: 8px 10px;
            background: #f8fafc;
            border-top: 1.5px solid #0f172a;
            border-bottom: 1.5px solid #0f172a;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .grand-total-label {
            font-size: 12px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: 0.5px;
            text-transform: uppercase;
          }
          .grand-total-value {
            font-size: 15px;
            font-weight: 800;
            color: #0f172a;
          }
          .payment-box {
            margin-top: 10px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 5px;
            padding: 8px 10px;
            font-size: 11px;
          }
          .payment-heading {
            font-weight: 700;
            color: #0f172a;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
          }
          .count-strip {
            display: flex;
            justify-content: space-between;
            margin-top: 6px;
            padding-top: 5px;
            border-top: 1px dashed #cbd5e1;
            font-size: 10px;
            color: #475569;
            font-weight: 600;
          }
          .qr-box {
            text-align: center;
            margin: 14px 0 6px 0;
          }
          .qr-img {
            width: 105px;
            height: 105px;
            border: 1px solid #e2e8f0;
            padding: 3px;
            border-radius: 4px;
          }
          .qr-text {
            font-size: 9px;
            color: #64748b;
            margin-top: 4px;
          }
          .footer-box {
            text-align: center;
            font-size: 9.5px;
            color: #64748b;
            line-height: 1.45;
            margin-top: 10px;
          }
          .footer-highlight {
            font-weight: 700;
            color: #0f172a;
            font-size: 10.5px;
            margin-top: 4px;
          }
        </style>
        </head>
        <body>
        <div class="invoice-card">
          <div class="banner-tag">40 YEARS OF EXCELLENCE</div>
          
          <div class="brand-header">
            ${logoBase64 ? `<img src="${logoBase64}" class="brand-logo-img" alt="Data Udipi" />` : ''}
            <div class="outlet-name">${cleanBranchTitle}</div>
            <div class="outlet-address">${branchAddress}</div>
            <div class="company-details">Data Udipi Limited • Regd. Office: Chennai</div>
            <div class="company-gstin">GSTIN: 29AAACT1836J1ZC</div>
          </div>

          <div class="divider-dashed"></div>
          <div class="invoice-type-badge">
            <span class="invoice-type-text">${invoiceTitle}</span>
          </div>
          <div class="divider-dashed"></div>

          <table class="meta-table">
            <tr>
              <td style="width: 55%;">
                <div><span class="meta-label">Invoice No : </span><span class="meta-val">${currentBillNo ? `BILL #${currentBillNo}` : orderId}</span></div>
                ${currentBillNo ? `<div><span class="meta-label">Bill No : </span><span class="bill-highlight">${currentBillNo}</span></div><div><span class="meta-label">Order Ref : </span><span class="meta-val">${orderId}</span></div>` : ''}
                <div><span class="meta-label">Order Type : </span><span class="meta-val">${orderType}</span></div>
                ${tableNumber ? `<div><span class="meta-label">Table : </span><span class="meta-val">${tableNumber}</span></div>` : (orderType.toLowerCase().includes('dine') ? `<div><span class="meta-label">Order Place : </span><span class="meta-val">Dine In</span></div>` : '')}
                <div><span class="meta-label">Mobile : </span><span class="meta-val">${mobileNumber}</span></div>
              </td>
              <td style="width: 45%; text-align: right;">
                <div><span class="meta-val">${formattedDate}</span></div>
                <div><span class="meta-label">Customer : </span><span class="meta-val">${customerName}</span></div>
                <div><span class="meta-label">Payment Mode : </span><span class="meta-val">${paymentMethod.toUpperCase()}</span></div>
                <div><span class="meta-label">Status : </span><span class="meta-val" style="color: #16a34a;">PAID</span></div>
              </td>
            </tr>
          </table>

          ${deliveryAddressStr ? `<div class="delivery-note"><strong>Delivery Address:</strong> ${deliveryAddressStr}</div>` : ''}

          <table class="items-table">
            <thead>
              <tr>
                <th class="text-left" style="width: 46%;">Description</th>
                <th class="text-right" style="width: 18%;">Price</th>
                <th class="text-center" style="width: 14%;">Qty</th>
                <th class="text-right" style="width: 22%;">Net Amt</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="totals-block">
            <div class="totals-row"><span>Gross Total :</span><span>₹${subtotal}</span></div>
            ${packagingFeeVal > 0 ? `<div class="totals-row"><span>Packaging Fee :</span><span>₹${packagingFeeVal.toFixed(2)}</span></div>` : ''}
            ${deliveryFeeVal > 0 ? `<div class="totals-row"><span>Delivery Fee :</span><span>₹${deliveryFeeVal.toFixed(2)}</span></div>` : ''}
            ${tipAmountVal > 0 ? `<div class="totals-row"><span>Rider Tip :</span><span>₹${tipAmountVal.toFixed(2)}</span></div>` : ''}
            ${discountAmountVal > 0 ? `<div class="totals-row discount"><span>Discount (${discountCodeStr}) :</span><span>-₹${discountAmount}</span></div>` : ''}
            ${totalGstValFromOrder > 0 ? `
            <div class="totals-row"><span>Net Taxable Value :</span><span>₹${netTaxable}</span></div>
            <div class="totals-row"><span>CGST @ 2.5% :</span><span>₹${cgst}</span></div>
            <div class="totals-row"><span>SGST @ 2.5% :</span><span>₹${sgst}</span></div>
            <div class="totals-row"><span>Total GST Amount :</span><span>₹${totalGst}</span></div>
            ` : ''}
          </div>

          <div class="grand-total-strip">
            <span class="grand-total-label">Total Invoice Amount :</span>
            <span class="grand-total-value">₹${finalTotal}</span>
          </div>

          <div class="payment-box">
            <div class="payment-heading">Payment Details</div>
            <div class="totals-row">
              <span>Mode : ${paymentMethod.toUpperCase()}</span>
              <span class="font-bold">₹${finalTotal}</span>
            </div>
            <div class="totals-row" style="font-weight: 700; margin-top: 2px;">
              <span>Total Received Amount :</span>
              <span>₹${finalTotal}</span>
            </div>
            <div class="count-strip">
              <span>Items Count : ${String(effectiveItems.length).padStart(2, '0')}</span>
              <span>Total Quantity : ${totalQty.toFixed(0)}</span>
            </div>
          </div>

          <div class="qr-box">
            <img src="${qrCodeUrl}" class="qr-img" alt="QR Code" />
            <div class="qr-text">Scan to verify invoice details</div>
          </div>

          <div class="footer-box">
            <div>No return / exchange on prepared food items.</div>
            <div class="footer-highlight">Thank you for dining with Data Udipi!</div>
          </div>
        </div>
        </body>
        </html>
      `;

      if (Platform.OS === 'web') {
        await Print.printAsync({ html: htmlContent });
      } else {
        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        const safeUri = FileSystem.documentDirectory + `DataUdipi_Bill_${orderId}.pdf`;
        await FileSystem.moveAsync({ from: uri, to: safeUri });
        await Sharing.shareAsync(safeUri, { UTI: '.pdf', mimeType: 'application/pdf' });
      }
    } catch (error) {
      console.error('Error generating bill PDF', error);
      Alert.alert('Error', 'Failed to generate PDF');
    } finally {
      setDownloading(false);
    }
  };

  const qrUrl = paymentMethod.toUpperCase() === 'UPI'
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=upi://pay?pa=dataudipi@upi%26pn=DataUdipi%26am=${finalTotal}%26cu=INR`
    : `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=CashPaymentConfirmed`;

  if (loadingOrder) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#ff4500" />
          <Text style={{ marginTop: 12 }}>Loading invoice...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(main)/home' as any)} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Invoice</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.invoiceCard}>
          <View style={styles.banner}>
            <Image source={require('../../../assets/images/frontpage_bg.png')} style={styles.bannerImg} />
            <Text style={styles.bannerText}>40 YEARS OF EXCELLENCE</Text>
          </View>

          <View style={styles.logoContainer}>
            <Image source={require('../../../assets/images/udupi-banner.png')} style={styles.logoImage} resizeMode="contain" />
          </View>

          <View style={styles.brandRow}>
            <Text style={styles.brandName}>{(branchName || '').includes(' — ') ? branchName.split(' — ')[0].trim() : (branchName || '').trim()} : {branchAddress}</Text>
          </View>

          <View style={styles.companyInfo}>
            <Text style={styles.companyName}>Data Udipi Limited</Text>
            <Text style={styles.companyText}>Place Of Supply : {branchName} - {branchAddress}.</Text>
            <Text style={styles.companyText}>Regd. Office: Chennai.</Text>
            <Text style={styles.companyText}>GSTIN NO: 29AAACT1836J1ZC</Text>
          </View>

          <View style={styles.divider} />
          <Text style={styles.invoiceTitle}>{totalGstValFromOrder > 0 ? 'TAX INVOICE' : 'RETAIL INVOICE'}</Text>
          <View style={styles.divider} />

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Invoice No : {currentBillNo ? `BILL #${currentBillNo}` : orderId}</Text>
            <Text style={styles.metaValue}>{formattedDate}</Text>
          </View>
          {currentBillNo ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={[styles.metaLabel, { color: '#00a01d', fontWeight: '700' }]}>Bill No : {currentBillNo}</Text>
              <Text style={styles.metaLabel}>Order Ref : {orderId}</Text>
            </View>
          ) : null}
          <Text style={styles.metaLabel}>Order Type : {orderType}</Text>
          {tableNumber ? (
            <Text style={styles.metaLabel}>Table : {tableNumber}</Text>
          ) : (String(orderType).toLowerCase().includes('dine') ? (
            <Text style={styles.metaLabel}>Order Place : Dine In</Text>
          ) : null)}
          <Text style={styles.metaLabel}>Customer : {customerName}</Text>
          <Text style={styles.metaLabel}>Mobile No : {mobileNumber}</Text>
          {deliveryAddressStr ? <Text style={styles.metaLabel}>Delivery Address : {deliveryAddressStr}</Text> : null}

          <View style={styles.divider} />

          <View style={styles.tableHeader}>
            <Text style={[styles.tableCol, { flex: 2 }]}>Description</Text>
            <Text style={[styles.tableCol, { flex: 1, textAlign: 'center' }]}>Price</Text>
            <Text style={[styles.tableCol, { flex: 1, textAlign: 'center' }]}>QTY</Text>
            <Text style={[styles.tableCol, { flex: 1, textAlign: 'right' }]}>Net Amt</Text>
          </View>

          {effectiveItems.map((item, idx) => {
            const name = String(item?.name || item?.itemName || 'ITEM').toUpperCase();
            const price = parseFloat(item?.price || item?.unit_price || 0) || 0;
            const qty = parseInt(item?.quantity || item?.qty || 1, 10) || 1;
            const netAmt = price * qty;
            return (
              <View key={item?.id ? `inv-${item.id}-${idx}` : `inv-${idx}`} style={styles.tableRow}>
                <Text style={[styles.tableColData, { flex: 2 }]} numberOfLines={2}>{name}</Text>
                <Text style={[styles.tableColData, { flex: 1, textAlign: 'center' }]}>₹{price.toFixed(2)}</Text>
                <Text style={[styles.tableColData, { flex: 1, textAlign: 'center' }]}>{String(qty).padStart(2, '0')}</Text>
                <Text style={[styles.tableColData, { flex: 1, textAlign: 'right' }]}>₹{netAmt.toFixed(2)}</Text>
              </View>
            );
          })}

          <View style={styles.divider} />

          <View style={styles.totalsContainer}>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Gross Total :</Text><Text style={styles.totalValue}>₹{subtotal}</Text></View>
            {packagingFeeVal > 0 && <View style={styles.totalRow}><Text style={styles.totalLabel}>Packaging Fee :</Text><Text style={styles.totalValue}>₹{packagingFeeVal.toFixed(2)}</Text></View>}
            {deliveryFeeVal > 0 && <View style={styles.totalRow}><Text style={styles.totalLabel}>Delivery Fee :</Text><Text style={styles.totalValue}>₹{deliveryFeeVal.toFixed(2)}</Text></View>}
            {tipAmountVal > 0 && <View style={styles.totalRow}><Text style={styles.totalLabel}>Rider Tip :</Text><Text style={styles.totalValue}>₹{tipAmountVal.toFixed(2)}</Text></View>}
            {discountAmountVal > 0 && (
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: '#00a01d' }]}>Discount ({discountCodeStr}) :</Text>
                <Text style={[styles.totalValue, { color: '#00a01d' }]}>-₹{discountAmount}</Text>
              </View>
            )}
            {totalGstValFromOrder > 0 && (
              <>
                <View style={styles.totalRow}><Text style={styles.totalLabel}>Net Taxable Value :</Text><Text style={styles.totalValue}>₹{netTaxable}</Text></View>
                <View style={styles.totalRow}><Text style={styles.totalLabel}>CGST @ 2.5% :</Text><Text style={styles.totalValue}>₹{cgst}</Text></View>
                <View style={styles.totalRow}><Text style={styles.totalLabel}>SGST @ 2.5% :</Text><Text style={styles.totalValue}>₹{sgst}</Text></View>
                <View style={styles.totalRow}><Text style={styles.totalLabel}>Total GST Amount :</Text><Text style={styles.totalValue}>₹{totalGst}</Text></View>
              </>
            )}
            <View style={styles.totalRow}><Text style={styles.totalLabelBold}>Total Invoice Amount :</Text><Text style={styles.totalValueBold}>₹{finalTotal}</Text></View>
          </View>

          <View style={styles.divider} />

          <View style={styles.paymentDelivery}>
            <Text style={styles.paymentTitle}>Payment & Delivery</Text>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{paymentMethod.toUpperCase()}</Text>
              <Text style={styles.totalValueBold}>₹{finalTotal}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabelBold}>Total received amount :</Text>
              <Text style={styles.totalValueBold}>₹{finalTotal}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>No of items : {String(effectiveItems.length).padStart(2, '0')}</Text>
              <Text style={styles.totalLabel}>Total qty : {totalQty.toFixed(0)}</Text>
            </View>
          </View>

          <View style={styles.qrSection}>
            <Image source={{ uri: qrUrl }} style={styles.qrImage} />
          </View>

          <View style={styles.terms}>
            <Text style={styles.termText}>No return / exchange on prepared food items.</Text>
            <Text style={styles.termText}>Thank you for dining with Data Udipi!</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.downloadBtn}
            onPress={generatePDF}
            disabled={downloading}
          >
            {downloading ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} /> : <Ionicons name="download" size={18} color="#fff" style={{ marginRight: 8 }} />}
            <Text style={styles.downloadBtnText}>{downloading ? 'Generating...' : 'Download bill'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/(main)/home' as any)}>
            <Ionicons name="home" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.backBtnText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f4f4',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  invoiceCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  banner: {
    position: 'relative',
    height: 100,
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerImg: {
    ...(StyleSheet.absoluteFill as any),
  },
  bannerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  logoImage: {
    width: 200,
    height: 40,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  brandName: {
    fontWeight: 'bold',
    fontSize: 16,
    marginRight: 8,
  },
  brandAddress: {
    flex: 1,
    fontSize: 11,
    color: '#555',
  },
  experience: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  experienceTitle: {
    fontWeight: 'bold',
    marginBottom: 12,
  },
  smileys: {
    flexDirection: 'row',
    gap: 16,
  },
  smiley: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  smileyActive: {
    backgroundColor: '#f0f0f0',
  },
  companyInfo: {
    alignItems: 'center',
    marginBottom: 16,
  },
  companyName: {
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 4,
  },
  companyText: {
    fontSize: 11,
    color: '#555',
    textAlign: 'center',
    marginBottom: 2,
  },
  divider: {
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#ccc',
    marginVertical: 12,
  },
  invoiceTitle: {
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 16,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 12,
    color: '#555',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    marginBottom: 8,
  },
  tableCol: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#333',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
  },
  tableColData: {
    fontSize: 11,
    color: '#444',
  },
  totalsContainer: {
    gap: 6,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 12,
    color: '#555',
  },
  totalValue: {
    fontSize: 12,
    color: '#333',
  },
  totalLabelBold: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000',
  },
  totalValueBold: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000',
  },
  paymentDelivery: {
    marginBottom: 16,
  },
  paymentTitle: {
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  qrSection: {
    alignItems: 'center',
    marginVertical: 16,
  },
  qrImage: {
    width: 150,
    height: 150,
  },
  terms: {
    alignItems: 'center',
    marginBottom: 16,
  },
  termText: {
    fontSize: 10,
    color: '#555',
    marginBottom: 4,
    textAlign: 'center',
  },
  actions: {
    marginTop: 20,
    gap: 12,
  },
  downloadBtn: {
    flexDirection: 'row',
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  backBtn: {
    flexDirection: 'row',
    backgroundColor: '#ff5a1f',
    paddingVertical: 14,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
