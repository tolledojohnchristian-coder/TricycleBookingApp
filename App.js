import React, { useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const STORAGE_KEYS = {
  accounts: 'TRICYCLE_BOOKING_ACCOUNTS',
  session: 'TRICYCLE_BOOKING_SESSION',
  bookingsPrefix: 'TRICYCLE_BOOKING_BOOKINGS_',
};

const emptyBookingForm = {
  pickup: '',
  destination: '',
  fare: '',
  date: '',
  status: 'Pending',
};

function showMessage(title, message) {
  Alert.alert(title, message);
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeUsername(username) {
  return username.trim().toLowerCase();
}

function formatCurrency(value) {
  return `₱${Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function parseBookingDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [screen, setScreen] = useState('login');
  const [accounts, setAccounts] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [bookings, setBookings] = useState([]);

  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ fullName: '', username: '', password: '' });

  const [searchText, setSearchText] = useState('');
  const [filter, setFilter] = useState('All');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBooking, setEditingBooking] = useState(null);
  const [bookingForm, setBookingForm] = useState(emptyBookingForm);

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    try {
      const savedAccounts = await AsyncStorage.getItem(STORAGE_KEYS.accounts);
      const savedSession = await AsyncStorage.getItem(STORAGE_KEYS.session);
      const parsedAccounts = savedAccounts ? JSON.parse(savedAccounts) : [];

      setAccounts(parsedAccounts);

      if (savedSession) {
        const user = JSON.parse(savedSession);
        const matchedUser = parsedAccounts.find((account) => account.username === user.username);
        if (matchedUser) {
          setCurrentUser(matchedUser);
          await loadBookings(matchedUser.username);
          setScreen('dashboard');
        } else {
          await AsyncStorage.removeItem(STORAGE_KEYS.session);
          setScreen('login');
        }
      }
    } catch (error) {
      showMessage('Storage Error', 'The app could not load saved data.');
    } finally {
      setIsLoading(false);
    }
  }

  async function loadBookings(username) {
    const savedBookings = await AsyncStorage.getItem(`${STORAGE_KEYS.bookingsPrefix}${username}`);
    setBookings(savedBookings ? JSON.parse(savedBookings) : []);
  }

  async function saveAccounts(nextAccounts) {
    setAccounts(nextAccounts);
    await AsyncStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(nextAccounts));
  }

  async function saveBookings(nextBookings) {
    setBookings(nextBookings);
    if (currentUser) {
      await AsyncStorage.setItem(
        `${STORAGE_KEYS.bookingsPrefix}${currentUser.username}`,
        JSON.stringify(nextBookings)
      );
    }
  }

  function updateLoginForm(field, value) {
    setLoginForm((previous) => ({ ...previous, [field]: value }));
  }

  function updateRegisterForm(field, value) {
    setRegisterForm((previous) => ({ ...previous, [field]: value }));
  }

  function updateBookingForm(field, value) {
    setBookingForm((previous) => ({ ...previous, [field]: value }));
  }

  async function handleRegister() {
    const fullName = registerForm.fullName.trim();
    const username = normalizeUsername(registerForm.username);
    const password = registerForm.password.trim();

    if (!fullName || !username || !password) {
      showMessage('Missing Details', 'Please complete Full Name, Username, and Password.');
      return;
    }

    if (password.length < 4) {
      showMessage('Invalid Password', 'Password must have at least 4 characters.');
      return;
    }

    const usernameExists = accounts.some((account) => account.username === username);
    if (usernameExists) {
      showMessage('Username Taken', 'Please choose another username.');
      return;
    }

    const nextAccounts = [
      ...accounts,
      {
        id: createId(),
        fullName,
        username,
        password,
      },
    ];

    try {
      await saveAccounts(nextAccounts);
      setRegisterForm({ fullName: '', username: '', password: '' });
      setScreen('login');
      showMessage('Account Created', 'Registration successful. Please log in.');
    } catch (error) {
      showMessage('Registration Error', 'The account could not be saved.');
    }
  }

  async function handleLogin() {
    const username = normalizeUsername(loginForm.username);
    const password = loginForm.password.trim();

    if (!username || !password) {
      showMessage('Missing Details', 'Please enter Username and Password.');
      return;
    }

    const matchedUser = accounts.find(
      (account) => account.username === username && account.password === password
    );

    if (!matchedUser) {
      showMessage('Login Failed', 'Invalid username or password.');
      return;
    }

    try {
      await AsyncStorage.setItem(STORAGE_KEYS.session, JSON.stringify(matchedUser));
      setCurrentUser(matchedUser);
      setLoginForm({ username: '', password: '' });
      await loadBookings(matchedUser.username);
      setScreen('dashboard');
    } catch (error) {
      showMessage('Login Error', 'The session could not be saved.');
    }
  }

  function openAddBooking() {
    setEditingBooking(null);
    setBookingForm(emptyBookingForm);
    setModalVisible(true);
  }

  function openEditBooking(booking) {
    setEditingBooking(booking);
    setBookingForm({
      pickup: booking.pickup,
      destination: booking.destination,
      fare: String(booking.fare),
      date: booking.date,
      status: booking.status,
    });
    setModalVisible(true);
  }

  async function handleSaveBooking() {
    const pickup = bookingForm.pickup.trim();
    const destination = bookingForm.destination.trim();
    const fare = Number(bookingForm.fare);
    const date = bookingForm.date.trim();
    const status = bookingForm.status;

    if (!pickup || !destination || !bookingForm.fare.trim() || !date) {
      showMessage('Invalid Booking', 'Pickup, Destination, Fare, and Date are required.');
      return;
    }

    if (!Number.isFinite(fare) || fare <= 0) {
      showMessage('Invalid Fare', 'Fare must be a valid amount greater than 0.');
      return;
    }

    const cleanedBooking = {
      id: editingBooking ? editingBooking.id : createId(),
      pickup,
      destination,
      fare,
      date,
      status,
      createdAt: editingBooking ? editingBooking.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const nextBookings = editingBooking
      ? bookings.map((booking) => (booking.id === editingBooking.id ? cleanedBooking : booking))
      : [cleanedBooking, ...bookings];

    try {
      await saveBookings(nextBookings);
      setModalVisible(false);
      setEditingBooking(null);
      setBookingForm(emptyBookingForm);
    } catch (error) {
      showMessage('Save Error', 'The booking could not be saved.');
    }
  }

  function handleDeleteBooking(booking) {
    Alert.alert(
      'Delete Booking',
      `Remove the ride from ${booking.pickup} to ${booking.destination}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const nextBookings = bookings.filter((item) => item.id !== booking.id);
              await saveBookings(nextBookings);
            } catch (error) {
              showMessage('Delete Error', 'The booking could not be deleted.');
            }
          },
        },
      ]
    );
  }

  async function toggleRideStatus(booking) {
    const nextStatus = booking.status === 'Pending' ? 'Completed' : 'Pending';
    const nextBookings = bookings.map((item) =>
      item.id === booking.id ? { ...item, status: nextStatus, updatedAt: new Date().toISOString() } : item
    );

    try {
      await saveBookings(nextBookings);
    } catch (error) {
      showMessage('Status Error', 'The ride status could not be updated.');
    }
  }

  function confirmLogout() {
    Alert.alert('Log Out', 'Do you want to log out of Tricycle Booking?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: handleLogout,
      },
    ]);
  }

  async function handleLogout() {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.session);
      setCurrentUser(null);
      setBookings([]);
      setSearchText('');
      setFilter('All');
      setScreen('login');
    } catch (error) {
      showMessage('Logout Error', 'The session could not be cleared.');
    }
  }

  const stats = useMemo(() => {
    const totalFare = bookings.reduce((sum, booking) => sum + Number(booking.fare || 0), 0);
    const completedRides = bookings.filter((booking) => booking.status === 'Completed').length;

    return {
      totalFare,
      rideCount: bookings.length,
      completedRides,
    };
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    const text = searchText.trim().toLowerCase();

    return bookings
      .filter((booking) => (filter === 'All' ? true : booking.status === filter))
      .filter((booking) => {
        if (!text) return true;
        const searchable = `${booking.pickup} ${booking.destination} ${booking.fare} ${booking.date} ${booking.status}`.toLowerCase();
        return searchable.includes(text);
      })
      .sort((a, b) => parseBookingDate(b.date) - parseBookingDate(a.date));
  }, [bookings, searchText, filter]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar style="light" />
        <View style={styles.logoCircle}>
          <Text style={styles.logoText}>TB</Text>
        </View>
        <Text style={styles.appTitle}>Tricycle Booking</Text>
        <Text style={styles.loadingText}>Loading saved session...</Text>
      </SafeAreaView>
    );
  }

  if (screen === 'register') {
    return (
      <SafeAreaView style={styles.authContainer}>
        <StatusBar style="light" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardContainer}
        >
          <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>TB</Text>
            </View>
            <Text style={styles.appTitle}>Create Account</Text>
            <Text style={styles.authSubtitle}>Register to start managing tricycle bookings.</Text>

            <View style={styles.authCard}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter full name"
                value={registerForm.fullName}
                onChangeText={(value) => updateRegisterForm('fullName', value)}
              />

              <Text style={styles.inputLabel}>Username</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter username"
                autoCapitalize="none"
                value={registerForm.username}
                onChangeText={(value) => updateRegisterForm('username', value)}
              />

              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter password"
                secureTextEntry
                value={registerForm.password}
                onChangeText={(value) => updateRegisterForm('password', value)}
              />

              <Pressable style={styles.primaryButton} onPress={handleRegister}>
                <Text style={styles.primaryButtonText}>Register</Text>
              </Pressable>

              <Pressable style={styles.linkButton} onPress={() => setScreen('login')}>
                <Text style={styles.linkText}>Already have an account? Log in</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (screen === 'login') {
    return (
      <SafeAreaView style={styles.authContainer}>
        <StatusBar style="light" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardContainer}
        >
          <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>TB</Text>
            </View>
            <Text style={styles.appTitle}>Tricycle Booking</Text>
            <Text style={styles.authSubtitle}>Book, monitor, and manage tricycle rides with ease.</Text>

            <View style={styles.authCard}>
              <Text style={styles.inputLabel}>Username</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter username"
                autoCapitalize="none"
                value={loginForm.username}
                onChangeText={(value) => updateLoginForm('username', value)}
              />

              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter password"
                secureTextEntry
                value={loginForm.password}
                onChangeText={(value) => updateLoginForm('password', value)}
              />

              <Pressable style={styles.primaryButton} onPress={handleLogin}>
                <Text style={styles.primaryButtonText}>Log In</Text>
              </Pressable>

              <Pressable style={styles.linkButton} onPress={() => setScreen('register')}>
                <Text style={styles.linkText}>No account yet? Create one</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.dashboardContainer}>
      <StatusBar style="light" />
      <View style={styles.dashboardHeader}>
        <View>
          <Text style={styles.headerGreeting}>Welcome,</Text>
          <Text style={styles.headerName}>{currentUser?.fullName || 'Passenger'}</Text>
        </View>
        <Pressable style={styles.logoutButton} onPress={confirmLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </Pressable>
      </View>

      <View style={styles.statsContainer}>
        <StatCard label="Total Fare" value={formatCurrency(stats.totalFare)} />
        <StatCard label="Rides" value={stats.rideCount} />
        <StatCard label="Completed" value={stats.completedRides} />
      </View>

      <View style={styles.controlsCard}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search pickup, destination, fare, date, or status"
          value={searchText}
          onChangeText={setSearchText}
        />
        <View style={styles.filterRow}>
          {['All', 'Pending', 'Completed'].map((item) => (
            <Pressable
              key={item}
              style={[styles.filterTab, filter === item && styles.activeFilterTab]}
              onPress={() => setFilter(item)}
            >
              <Text style={[styles.filterText, filter === item && styles.activeFilterText]}>{item}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        data={filteredBookings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<EmptyState hasBookings={bookings.length > 0} />}
        renderItem={({ item }) => (
          <BookingCard
            booking={item}
            onEdit={() => openEditBooking(item)}
            onDelete={() => handleDeleteBooking(item)}
            onToggleStatus={() => toggleRideStatus(item)}
          />
        )}
      />

      <Pressable style={styles.floatingButton} onPress={openAddBooking}>
        <Text style={styles.floatingButtonText}>+ Add Booking</Text>
      </Pressable>

      <BookingFormModal
        visible={modalVisible}
        isEditing={Boolean(editingBooking)}
        form={bookingForm}
        onChange={updateBookingForm}
        onCancel={() => {
          setModalVisible(false);
          setEditingBooking(null);
          setBookingForm(emptyBookingForm);
        }}
        onSave={handleSaveBooking}
      />
    </SafeAreaView>
  );
}

function StatCard({ label, value }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function EmptyState({ hasBookings }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>{hasBookings ? '🔍' : '🛺'}</Text>
      <Text style={styles.emptyTitle}>{hasBookings ? 'No matching bookings' : 'No bookings yet'}</Text>
      <Text style={styles.emptyText}>
        {hasBookings
          ? 'Try another keyword or change the selected filter.'
          : 'Tap + Add Booking to create the first tricycle ride record.'}
      </Text>
    </View>
  );
}

function BookingCard({ booking, onEdit, onDelete, onToggleStatus }) {
  const isCompleted = booking.status === 'Completed';

  return (
    <View style={styles.bookingCard}>
      <View style={styles.bookingTopRow}>
        <View style={styles.routeContainer}>
          <Text style={styles.routeText}>{booking.pickup}</Text>
          <Text style={styles.routeArrow}>→</Text>
          <Text style={styles.routeText}>{booking.destination}</Text>
        </View>
        <Pressable
          style={[styles.statusBadge, isCompleted ? styles.completedBadge : styles.pendingBadge]}
          onPress={onToggleStatus}
        >
          <Text style={[styles.statusText, isCompleted ? styles.completedText : styles.pendingText]}>
            {booking.status}
          </Text>
        </Pressable>
      </View>

      <View style={styles.bookingInfoRow}>
        <View>
          <Text style={styles.infoLabel}>Fare</Text>
          <Text style={styles.infoValue}>{formatCurrency(booking.fare)}</Text>
        </View>
        <View>
          <Text style={styles.infoLabel}>Date</Text>
          <Text style={styles.infoValue}>{booking.date}</Text>
        </View>
      </View>

      <View style={styles.cardActionRow}>
        <Pressable style={styles.editButton} onPress={onEdit}>
          <Text style={styles.editButtonText}>Edit</Text>
        </Pressable>
        <Pressable style={styles.deleteButton} onPress={onDelete}>
          <Text style={styles.deleteButtonText}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

function BookingFormModal({ visible, isEditing, form, onChange, onCancel, onSave }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{isEditing ? 'Edit Booking' : 'Add Booking'}</Text>
            <Pressable onPress={onCancel}>
              <Text style={styles.modalClose}>✕</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.inputLabel}>Pickup Location</Text>
            <TextInput
              style={styles.input}
              placeholder="Example: Virac Terminal"
              value={form.pickup}
              onChangeText={(value) => onChange('pickup', value)}
            />

            <Text style={styles.inputLabel}>Destination</Text>
            <TextInput
              style={styles.input}
              placeholder="Example: CatSU Main Campus"
              value={form.destination}
              onChangeText={(value) => onChange('destination', value)}
            />

            <Text style={styles.inputLabel}>Fare</Text>
            <TextInput
              style={styles.input}
              placeholder="Example: 50"
              keyboardType="decimal-pad"
              value={form.fare}
              onChangeText={(value) => onChange('fare', value)}
            />

            <Text style={styles.inputLabel}>Date</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD or May 22, 2026"
              value={form.date}
              onChangeText={(value) => onChange('date', value)}
            />

            <Text style={styles.inputLabel}>Ride Status</Text>
            <View style={styles.statusSelectorRow}>
              {['Pending', 'Completed'].map((status) => (
                <Pressable
                  key={status}
                  style={[styles.statusOption, form.status === status && styles.activeStatusOption]}
                  onPress={() => onChange('status', status)}
                >
                  <Text
                    style={[styles.statusOptionText, form.status === status && styles.activeStatusOptionText]}
                  >
                    {status}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.modalActionRow}>
              <Pressable style={styles.cancelButton} onPress={onCancel}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.saveButton} onPress={onSave}>
                <Text style={styles.saveButtonText}>Save Booking</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#12372A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  keyboardContainer: {
    flex: 1,
  },
  authContainer: {
    flex: 1,
    backgroundColor: '#12372A',
  },
  authScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  logoCircle: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: '#FBFADA',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 18,
  },
  logoText: {
    color: '#12372A',
    fontSize: 28,
    fontWeight: '900',
  },
  appTitle: {
    color: '#FBFADA',
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
  },
  loadingText: {
    color: '#D7E4C0',
    marginTop: 10,
    fontSize: 15,
  },
  authSubtitle: {
    color: '#D7E4C0',
    marginTop: 8,
    marginBottom: 24,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
  },
  authCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 22,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 5,
  },
  inputLabel: {
    color: '#12372A',
    fontWeight: '800',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#F5F7F1',
    borderWidth: 1,
    borderColor: '#D9E2D0',
    borderRadius: 16,
    paddingHorizontal: 15,
    paddingVertical: 13,
    color: '#12372A',
    fontSize: 15,
  },
  primaryButton: {
    backgroundColor: '#436850',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 22,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
  },
  linkButton: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  linkText: {
    color: '#436850',
    fontWeight: '800',
  },
  dashboardContainer: {
    flex: 1,
    backgroundColor: '#F5F7F1',
  },
  dashboardHeader: {
    backgroundColor: '#12372A',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerGreeting: {
    color: '#D7E4C0',
    fontSize: 14,
  },
  headerName: {
    color: '#FBFADA',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 4,
    maxWidth: 230,
  },
  logoutButton: {
    backgroundColor: '#FBFADA',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  logoutButtonText: {
    color: '#12372A',
    fontWeight: '900',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: -18,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  statValue: {
    color: '#12372A',
    fontSize: 17,
    fontWeight: '900',
  },
  statLabel: {
    color: '#71806C',
    marginTop: 5,
    fontWeight: '700',
    fontSize: 12,
  },
  controlsCard: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    borderRadius: 22,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  searchInput: {
    backgroundColor: '#F5F7F1',
    borderRadius: 16,
    paddingHorizontal: 15,
    paddingVertical: 12,
    color: '#12372A',
    fontSize: 14,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#EEF3EA',
  },
  activeFilterTab: {
    backgroundColor: '#436850',
  },
  filterText: {
    color: '#436850',
    fontWeight: '800',
  },
  activeFilterText: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  bookingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#EBF0E5',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  bookingTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  routeContainer: {
    flex: 1,
  },
  routeText: {
    color: '#12372A',
    fontSize: 17,
    fontWeight: '900',
  },
  routeArrow: {
    color: '#71806C',
    fontWeight: '900',
    marginVertical: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  pendingBadge: {
    backgroundColor: '#FFF5D6',
  },
  completedBadge: {
    backgroundColor: '#E1F5E8',
  },
  statusText: {
    fontWeight: '900',
    fontSize: 12,
  },
  pendingText: {
    color: '#9A6A00',
  },
  completedText: {
    color: '#247447',
  },
  bookingInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F5F7F1',
    padding: 14,
    borderRadius: 18,
    marginTop: 14,
  },
  infoLabel: {
    color: '#71806C',
    fontWeight: '700',
    fontSize: 12,
  },
  infoValue: {
    color: '#12372A',
    fontWeight: '900',
    marginTop: 4,
  },
  cardActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  editButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#E6EFE0',
  },
  editButtonText: {
    color: '#436850',
    fontWeight: '900',
  },
  deleteButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#FFE5E5',
  },
  deleteButtonText: {
    color: '#B42318',
    fontWeight: '900',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    color: '#12372A',
    fontWeight: '900',
    fontSize: 20,
    marginTop: 14,
  },
  emptyText: {
    color: '#71806C',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 21,
  },
  floatingButton: {
    position: 'absolute',
    right: 18,
    bottom: 24,
    backgroundColor: '#12372A',
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 7,
  },
  floatingButtonText: {
    color: '#FBFADA',
    fontWeight: '900',
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(18, 55, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 22,
    maxHeight: '92%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  modalTitle: {
    color: '#12372A',
    fontSize: 24,
    fontWeight: '900',
  },
  modalClose: {
    color: '#71806C',
    fontSize: 24,
    fontWeight: '900',
    padding: 4,
  },
  statusSelectorRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statusOption: {
    flex: 1,
    backgroundColor: '#EEF3EA',
    paddingVertical: 13,
    borderRadius: 15,
    alignItems: 'center',
  },
  activeStatusOption: {
    backgroundColor: '#436850',
  },
  statusOptionText: {
    color: '#436850',
    fontWeight: '900',
  },
  activeStatusOptionText: {
    color: '#FFFFFF',
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
    marginBottom: 8,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#EEF3EA',
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#436850',
    fontWeight: '900',
  },
  saveButton: {
    flex: 1.4,
    backgroundColor: '#12372A',
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
});
