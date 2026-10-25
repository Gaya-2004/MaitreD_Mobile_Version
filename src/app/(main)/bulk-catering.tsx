import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ImageBackground, Platform, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';

export default function BulkCatering() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle='dark-content' backgroundColor='#f9f9f9' />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Header Image */}
        <ImageBackground 
          source={require('../../../assets/images/banner_bg.jpg')} 
          style={styles.headerImageContainer}
          imageStyle={{ resizeMode: 'cover' }}
        >
          {/* Back button */}
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#333" />
          </TouchableOpacity>
          
          <View style={styles.headerOverlay}>
            <View style={styles.tagContainer}>
              <MaterialCommunityIcons name="square-rounded" size={10} color="#4caf50" style={{marginRight: 6}} />
              <Text style={styles.tagText}>PREMIUM CATERING</Text>
            </View>
            <Text style={styles.headerTitle}>Fresh vegetarian catering for 50+ guests</Text>
          </View>
        </ImageBackground>

        {/* Content Container */}
        <View style={styles.contentContainer}>
          <Text style={styles.title}>Data Udipi Bulk Catering</Text>
          <Text style={styles.description}>
            Experience 40 years of South Indian vegetarian culinary excellence at your special event. From intimate family gatherings to grand feasts.
          </Text>

          <Text style={styles.sectionTitle}>Why choose Data Udipi?</Text>

          {/* Features Grid */}
          <View style={styles.gridContainer}>
            <View style={styles.gridCard}>
              <View style={[styles.iconCircle, { backgroundColor: '#fff3e0' }]}>
                <MaterialCommunityIcons name="calendar-month-outline" size={18} color="#ff4500" />
              </View>
              <Text style={styles.cardTitle}>Advance Booking</Text>
              <Text style={styles.cardDesc}>Secure your preferred slot up to 12 months in advance</Text>
            </View>

            <View style={styles.gridCard}>
              <View style={[styles.iconCircle, { backgroundColor: '#fff3e0' }]}>
                <MaterialCommunityIcons name="cog-outline" size={18} color="#ff4500" />
              </View>
              <Text style={styles.cardTitle}>Customisable Menu</Text>
              <Text style={styles.cardDesc}>Swap dishes, adjust spice levels & add special request notes</Text>
            </View>

            <View style={styles.gridCard}>
              <View style={[styles.iconCircle, { backgroundColor: '#fff3e0' }]}>
                <MaterialCommunityIcons name="clock-outline" size={18} color="#ff4500" />
              </View>
              <Text style={styles.cardTitle}>On-Time Hot Service</Text>
              <Text style={styles.cardDesc}>Guaranteed warm delivery and professional handling</Text>
            </View>

            <View style={styles.gridCard}>
              <View style={[styles.iconCircle, { backgroundColor: '#fff3e0' }]}>
                <MaterialCommunityIcons name="shield-check-outline" size={18} color="#ff4500" />
              </View>
              <Text style={styles.cardTitle}>Hygiene First</Text>
              <Text style={styles.cardDesc}>Sanitised packaging and contactless service options</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Featured Packages</Text>

          {/* Packages Grid */}
          <View style={styles.gridContainer}>
            <View style={styles.gridCard}>
              <View style={[styles.iconCircle, { backgroundColor: '#e8f5e9' }]}>
                <MaterialCommunityIcons name="leaf" size={18} color="#4caf50" />
              </View>
              <Text style={styles.cardTitle}>Variety Lunch</Text>
              <Text style={styles.cardDesc}>Classic spread with rice, kootu, fry & sweet</Text>
            </View>

            <View style={styles.gridCard}>
              <View style={[styles.iconCircle, { backgroundColor: '#ffebee' }]}>
                <MaterialCommunityIcons name="silverware-fork-knife" size={18} color="#ff4500" />
              </View>
              <Text style={styles.cardTitle}>Grand Feast</Text>
              <Text style={styles.cardDesc}>Premium drinks, starters, sweets & full service</Text>
            </View>
          </View>

          {/* Terms & Conditions Block */}
          <View style={styles.termsContainer}>
            <Text style={styles.termsTitle}>Customers Kind Attention</Text>
            <View style={styles.termsList}>
              <Text style={styles.termsText}>• This Outdoor Catering Order is booked by M/s. Data Udipi Hotel, 51, Anna main Road, M.G.R. Nagar, Chennai - 600 078 for necessary execution by them.</Text>
              <Text style={styles.termsText}>• Please Contact 63806 96563 for payment details and other enquiries on this catering order.</Text>
              <Text style={styles.termsText}>• Service time is limited to TWO HOURS only.</Text>
              <Text style={styles.termsText}>• Service will be provided for persons 50 and minimum of charge Rs.1000/-.</Text>
              <Text style={styles.termsText}>• The person who gives the order is responsible for all the utensils brought for service.</Text>
              <Text style={styles.termsText}>• Only the items ordered and brought by us will be served by our staff.</Text>
              <Text style={styles.termsText}>• Changes if any in the menu or cancellation of order should be done only in person, 48 hours before service time.</Text>
              <Text style={styles.termsText}>• Transportation charges will be collected according to the distance of place of serving from our Kodambakkam Branch.</Text>
              <Text style={styles.termsText}>• Orders are not taken over phone.</Text>
              <Text style={styles.termsText}>• Advance should be 50% of the value of the order. Children of any age will also be counted one meal. Full payment to be made 2 days prior to the order.</Text>
            </View>
            <Text style={styles.taxText}>* VAT & Service Tax Applicable</Text>
          </View>

        </View>
      </ScrollView>

      {/* Bottom Buttons */}
      <View style={[styles.bottomContainer, { paddingBottom: insets.bottom > 0 ? insets.bottom + 16 : 24 }]}>
        <TouchableOpacity 
          style={styles.primaryButton}
          onPress={() => router.push('/(main)/catering-event-details')}
        >
          <Text style={styles.primaryButtonText}>Start Planning</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.secondaryButton}
          onPress={() => router.push('/(order)/orders')}
        >
          <Text style={styles.secondaryButtonText}>View Scheduled Orders</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9f9', // Light background matching design
  },
  scrollContent: {
    paddingBottom: 220,
  },
  headerImageContainer: {
    width: '100%',
    height: 280, // Fixed height for a better aspect ratio
    justifyContent: 'flex-end',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
  },
  headerOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    padding: 20,
    paddingTop: 40, // Fade out to top if possible, but padding is fine
    width: '100%',
    alignItems: 'flex-start',
  },
  tagContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  tagText: {
    color: '#111',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'left',
    lineHeight: 30,
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  contentContainer: {
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#222',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#777',
    lineHeight: 22,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#222',
    marginBottom: 16,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  gridCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 6,
  },
  cardDesc: {
    fontSize: 12,
    color: '#444',
    lineHeight: 18,
    fontWeight: '500',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingTop: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 5,
  },
  primaryButton: {
    backgroundColor: '#ff4500',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  secondaryButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  termsContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginTop: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#eee',
  },
  termsTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#d32f2f',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  termsList: {
    marginBottom: 12,
  },
  termsText: {
    fontSize: 12,
    color: '#555',
    lineHeight: 18,
    marginBottom: 8,
  },
  taxText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
    fontStyle: 'italic',
  },
});
