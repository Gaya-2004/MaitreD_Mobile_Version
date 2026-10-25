import React, { useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, StatusBar, Text, TouchableOpacity, Platform, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { usePaymentMethodStore } from '../../store';

const RAZORPAY_KEY = 'rzp_live_T4wysiHzIDwFA1';

export default function RazorpayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const { amount, phone, orderType, paymentMethodId, razorpayOrderId, returnPath, returnParams } = params;
  const webViewRef = useRef<WebView>(null);

  const { paymentMethods, selectedMethodId, setSelectedMethod } = usePaymentMethodStore();

  const savedCards = paymentMethods.filter((m: any) => m.category === 'card');

  // Determine currently selected card
  const effectiveId = (paymentMethodId as string) || selectedMethodId;
  let initialCard = savedCards.find((m: any) => m.id === effectiveId) || savedCards[0];

  const [activeCardId, setActiveCardId] = useState<string>(initialCard?.id || '');
  const [copiedToast, setCopiedToast] = useState<string | null>(null);

  const activeCard = savedCards.find((m: any) => m.id === activeCardId) || initialCard;

  const handleSelectCard = (card: any) => {
    setActiveCardId(card.id);
    setSelectedMethod(card.id);
    setCopiedToast(`Selected ${card.subtitle}`);
    setTimeout(() => setCopiedToast(null), 2500);

    const cleanNum = card.subtitle || '';
    const cardName = card.title || '';
    const jsCode = `
      if (typeof window.fillCardFromApp === 'function') {
        window.fillCardFromApp(${JSON.stringify(cleanNum)}, ${JSON.stringify(cardName)});
      }
      true;
    `;
    webViewRef.current?.injectJavaScript(jsCode);
  };

  const amountInPaise = Math.round(Number(amount || 0) * 100);

  const razorpayHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Razorpay Payment</title>
      <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
      <style>
        body {
          margin: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          background: #f5f5f5;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        .loading {
          text-align: center;
          color: #666;
          font-size: 16px;
        }
        .loading .spinner {
          border: 4px solid #f3f3f3;
          border-top: 4px solid #ff3400;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
          margin: 0 auto 20px;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    </head>
    <body>
      <div class="loading">
        <div class="spinner"></div>
        <p>Opening Razorpay Checkout...</p>
      </div>
      <script>
        var savedCardsList = ${JSON.stringify(savedCards)};
        var currentCardNum = ${JSON.stringify(activeCard?.subtitle || '')};
        var currentCardHolder = ${JSON.stringify(activeCard?.title || '')};

        function fillInputValue(input, val) {
          if (!input || !val) return;
          try {
            input.focus();
            var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
            if (nativeSetter && nativeSetter.set) {
              nativeSetter.set.call(input, val);
            } else {
              input.value = val;
            }
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          } catch(err) {
            input.value = val;
          }
        }

        window.fillCardFromApp = function(num, name) {
          currentCardNum = num;
          currentCardHolder = name;
          applyCardToDom(num, name);
        };

        function applyCardToDom(num, name) {
          try {
            var docList = [document];
            var iframes = document.querySelectorAll('iframe');
            iframes.forEach(function(f) {
              try {
                if (f.contentDocument) docList.push(f.contentDocument);
              } catch(e) {}
            });

            docList.forEach(function(d) {
              var inputs = d.querySelectorAll('input');
              inputs.forEach(function(inp) {
                var n = (inp.name || '').toLowerCase();
                var id = (inp.id || '').toLowerCase();
                var ph = (inp.placeholder || '').toLowerCase();
                var ac = (inp.autocomplete || '').toLowerCase();
                if (ac === 'cc-number' || n.includes('card[number]') || id.includes('card_number') || ph.includes('card number') || ph.includes('0000') || n.includes('card_num')) {
                  fillInputValue(inp, num);
                }
                if ((n.includes('name') || id.includes('name') || ph.includes('name')) && name) {
                  fillInputValue(inp, name);
                }
              });
            });
          } catch(e) {}
        }

        function runSavedCardsInjector() {
          try {
            var docList = [document];
            var iframes = document.querySelectorAll('iframe');
            iframes.forEach(function(f) {
              try {
                if (f.contentDocument) docList.push(f.contentDocument);
              } catch(e) {}
            });

            docList.forEach(function(doc) {
              var cardInput = null;
              var inputs = doc.querySelectorAll('input');
              inputs.forEach(function(inp) {
                var n = (inp.name || '').toLowerCase();
                var id = (inp.id || '').toLowerCase();
                var ph = (inp.placeholder || '').toLowerCase();
                var ac = (inp.autocomplete || '').toLowerCase();
                if (ac === 'cc-number' || n.includes('card[number]') || id.includes('card_number') || ph.includes('card number') || ph.includes('0000') || n.includes('card_num')) {
                  cardInput = inp;
                }
              });

              if (cardInput) {
                // Pre-fill active card number if empty
                if (!cardInput.value && currentCardNum) {
                  fillInputValue(cardInput, currentCardNum);
                }

                // Inject Saved Cards bar inside the Razorpay Card screen
                if (savedCardsList.length > 0 && !doc.getElementById('rzp-saved-cards-box')) {
                  var container = doc.createElement('div');
                  container.id = 'rzp-saved-cards-box';
                  container.style.cssText = 'margin: 10px 0 14px 0; padding: 10px 12px; background: #fff8f6; border: 1.5px solid #ffccba; border-radius: 10px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;';

                  var header = doc.createElement('div');
                  header.style.cssText = 'font-size: 11px; font-weight: 700; color: #ff3400; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; text-transform: uppercase; letter-spacing: 0.5px;';
                  header.innerHTML = '<span>💳 Choose Saved Card</span><span style="font-size: 10px; color: #00a01d; font-weight: 600;">Tap to fill</span>';
                  container.appendChild(header);

                  var cardList = doc.createElement('div');
                  cardList.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';

                  savedCardsList.forEach(function(c) {
                    var btn = doc.createElement('button');
                    btn.type = 'button';
                    btn.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer; text-align: left; transition: all 0.15s ease;';
                    btn.innerHTML = '<div style="display: flex; align-items: center; gap: 6px;"><span style="background: #1a1f71; color: #fff; font-size: 8px; font-weight: 800; padding: 2px 5px; border-radius: 3px;">' + (c.badgeType || 'CARD') + '</span><span style="font-size: 12px; font-weight: 600; color: #1a202c;">' + (c.title || 'Card') + '</span></div><span style="font-size: 11px; font-family: monospace; font-weight: 700; color: #4a5568;">' + (c.subtitle || '') + '</span>';
                    
                    btn.onclick = function(e) {
                      e.preventDefault();
                      e.stopPropagation();
                      fillInputValue(cardInput, c.subtitle);
                      inputs.forEach(function(inp2) {
                        var n2 = (inp2.name || '').toLowerCase();
                        if (n2.includes('name') && c.title) {
                          fillInputValue(inp2, c.title);
                        }
                      });
                      btn.style.borderColor = '#00a01d';
                      btn.style.background = '#e8f5e9';
                      setTimeout(function() {
                        btn.style.borderColor = '#e2e8f0';
                        btn.style.background = '#ffffff';
                      }, 1000);
                    };
                    cardList.appendChild(btn);
                  });

                  container.appendChild(cardList);

                  var parent = cardInput.closest('form') || cardInput.parentElement;
                  if (parent && parent.parentElement) {
                    parent.parentElement.insertBefore(container, parent);
                  } else if (cardInput.parentElement) {
                    cardInput.parentElement.insertBefore(container, cardInput);
                  }
                }
              }
            });
          } catch(e) {}
        }

        var injectTimer = setInterval(runSavedCardsInjector, 350);
        setTimeout(function() { clearInterval(injectTimer); }, 60000);

        var options = {
          key: '${RAZORPAY_KEY}',
          amount: ${amountInPaise},
          ${razorpayOrderId && !razorpayOrderId.toString().startsWith('test_') ? `order_id: '${razorpayOrderId}',` : ''}
          currency: 'INR',
          name: 'Udupi Restaurant',
          description: '${orderType || 'Food'} Order Payment',
          remember_customer: true,
          prefill: {
            contact: '${phone || '+919876543210'}',
            method: '${paymentMethodId || 'card'}',
            ${activeCard && paymentMethodId !== 'upi' ? `name: '${activeCard.title}',` : ''}
            ${activeCard && paymentMethodId !== 'upi' ? `'card[number]': '${activeCard.subtitle}',` : ''}
            ${activeCard && paymentMethodId !== 'upi' ? `card: { number: '${activeCard.subtitle}', name: '${activeCard.title}' },` : ''}
          },
          notes: {
            ${activeCard ? `saved_card_number: '${activeCard.subtitle}',` : ''}
            ${activeCard ? `saved_card_title: '${activeCard.title}',` : ''}
          },
          theme: {
            color: '#ff3400'
          },
          handler: function(response) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              status: 'success',
              payment_id: response.razorpay_payment_id,
              order_id: response.razorpay_order_id,
              signature: response.razorpay_signature
            }));
          },
          modal: {
            ondismiss: function() {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                status: 'cancelled',
                reason: 'Payment modal dismissed by user'
              }));
            }
          }
        };

        try {
          var rzp = new Razorpay(options);
          rzp.on('payment.failed', function(response) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              status: 'failed',
              reason: response.error.description || 'Payment failed'
            }));
          });
          rzp.open();
        } catch (e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            status: 'failed',
            reason: 'Could not initialize Razorpay: ' + e.message
          }));
        }
      </script>
    </body>
    </html>
  `;

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.status === 'success') {
        if (params.isDineInSettlement === 'true' && params.dbOrderId) {
          const dbId = params.dbOrderId as string;
          const amt = Number(params.amount || 0);
          import('../../services/apiService').then(({ orderApi }) => {
            import('../../store/useDineInSessionStore').then(({ useDineInSessionStore }) => {
              orderApi.settleDineInPayment(dbId, {
                payment_method: 'Razorpay',
                payment_id: data.payment_id,
                amount_paid: amt,
              }).then((res: any) => {
                useDineInSessionStore.getState().completeDineInSession();
                router.replace({
                  pathname: '/order-completed',
                  params: {
                    orderId: res.orderId || (params.orderId as string),
                    dbOrderId: dbId,
                    tableNumber: res.tableNumber || (params.tableNumber as string) || '',
                    totalAmount: (res.totalAmount || amt).toString(),
                    paymentMethod: 'Razorpay',
                    cartItems: JSON.stringify(res.items || []),
                    orderType: 'Dine In',
                    date: new Date().toISOString(),
                  }
                });
              }).catch((err: any) => {
                console.error('Failed to settle dine-in payment after Razorpay', err);
                router.replace('/home');
              });
            });
          });
          return;
        }

        if (returnPath) {
          router.replace({
            pathname: returnPath as any,
            params: {
              razorpay_status: 'success',
              razorpay_payment_id: data.payment_id,
              razorpay_order_id: data.order_id,
              razorpay_signature: data.signature,
              ...(returnParams ? JSON.parse(returnParams as string) : {})
            }
          });
          return;
        }

        router.replace({
          pathname: '/(checkout)/payment',
          params: {
            razorpay_status: 'success',
            razorpay_payment_id: data.payment_id,
          }
        });
      } else if (data.status === 'cancelled') {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/(checkout)/payment');
        }
      } else {
        router.replace({
          pathname: '/(checkout)/payment',
          params: {
            razorpay_status: 'failed',
            razorpay_reason: data.reason || 'Payment failed',
          }
        });
      }
    } catch (e) {
      console.error('Failed to parse Razorpay message', e);
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(checkout)/payment');
      }
    }
  };

  const topPadding = Platform.OS === 'android'
    ? Math.max(StatusBar.currentHeight || 0, 24) + 14
    : Math.max(insets.top, 16) + 8;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* Header with generous top spacing */}
      <View style={[styles.header, { paddingTop: topPadding }]}>
        <TouchableOpacity 
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(checkout)/payment');
            }
          }} 
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Secure Payment</Text>
        <View style={styles.secureIndicator}>
          <Ionicons name="lock-closed" size={14} color="#00a01d" />
        </View>
      </View>

      {/* Saved Cards Selector Section */}
      {savedCards.length > 0 && (
        <View style={styles.savedCardsNativeSection}>
          <View style={styles.savedCardsTitleRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="card" size={15} color="#ff3400" style={{ marginRight: 6 }} />
              <Text style={styles.savedCardsSectionTitle}>YOUR SAVED CARDS</Text>
            </View>
            {copiedToast ? (
              <View style={styles.toastBadge}>
                <Ionicons name="checkmark-circle" size={12} color="#00a01d" style={{ marginRight: 4 }} />
                <Text style={styles.toastText}>{copiedToast}</Text>
              </View>
            ) : (
              <Text style={styles.savedCardsHint}>Tap card to fill in Razorpay</Text>
            )}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardScrollContainer}>
            {savedCards.map((card) => {
              const isSelected = card.id === activeCardId;
              return (
                <TouchableOpacity
                  key={card.id}
                  style={[styles.nativeCardItem, isSelected && styles.nativeCardItemSelected]}
                  onPress={() => handleSelectCard(card)}
                  activeOpacity={0.7}
                >
                  <View style={styles.nativeCardTop}>
                    <View style={[styles.cardBrandBadge, card.badgeType === 'VISA' ? styles.visaBadge : styles.masterBadge]}>
                      <Text style={styles.cardBrandText}>{card.badgeType || 'CARD'}</Text>
                    </View>
                    {isSelected ? (
                      <View style={styles.activeCheckBadge}>
                        <Ionicons name="checkmark" size={11} color="#fff" />
                      </View>
                    ) : (
                      <Text style={styles.tapToUseText}>Tap to use</Text>
                    )}
                  </View>

                  <Text style={styles.nativeCardTitle} numberOfLines={1}>{card.title}</Text>
                  <Text style={styles.nativeCardNumber}>{card.subtitle}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      <WebView
        ref={webViewRef}
        source={{ html: razorpayHTML }}
        onMessage={handleMessage}
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={(request) => {
          const url = request.url;
          if (
            url.startsWith('upi://') ||
            url.startsWith('tez://') ||
            url.startsWith('phonepe://') ||
            url.startsWith('paytmmp://') ||
            url.startsWith('intent://') ||
            url.startsWith('gpay://') ||
            url.startsWith('paytm://') ||
            url.startsWith('bhim://')
          ) {
            Linking.openURL(url).catch((err) => {
              console.error('Failed to open UPI app', err);
            });
            return false;
          }
          return true;
        }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowFileAccess={true}
        allowFileAccessFromFileURLs={true}
        allowUniversalAccessFromFileURLs={true}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ff3400" />
            <Text style={styles.loadingText}>Loading Razorpay...</Text>
          </View>
        )}
        style={styles.webview}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backBtn: {
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
    flex: 1,
  },
  secureIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  savedCardsNativeSection: {
    backgroundColor: '#fbfbfb',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  savedCardsTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  savedCardsSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ff3400',
    letterSpacing: 0.5,
  },
  savedCardsHint: {
    fontSize: 11,
    color: '#888',
  },
  toastBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  toastText: {
    fontSize: 11,
    color: '#00a01d',
    fontWeight: '600',
  },
  cardScrollContainer: {
    gap: 10,
    paddingRight: 16,
  },
  nativeCardItem: {
    width: 200,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 10,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  nativeCardItemSelected: {
    borderColor: '#ff3400',
    backgroundColor: '#fff9f7',
    borderWidth: 1.5,
  },
  nativeCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardBrandBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#1a1f71',
  },
  visaBadge: {
    backgroundColor: '#1a1f71',
  },
  masterBadge: {
    backgroundColor: '#eb001b',
  },
  cardBrandText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  activeCheckBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ff3400',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapToUseText: {
    fontSize: 10,
    color: '#ff3400',
    fontWeight: '600',
  },
  nativeCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  nativeCardNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: '#444',
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 15,
    color: '#666',
  },
});
