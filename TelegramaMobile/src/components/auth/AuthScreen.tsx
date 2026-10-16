import React, { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { colors, radii } from '../../theme/colors';

type Mode = 'login' | 'register' | 'verify';
type NoticeKind = 'info' | 'success' | 'error';
type Notice = { text: string; kind: NoticeKind } | null;

export function AuthScreen() {
  const { login, register, verifyEmail, resendVerification, apiUrl, updateApiUrl } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [userTag, setUserTag] = useState('');
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [apiDraft, setApiDraft] = useState(apiUrl);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(value => Math.max(value - 1, 0)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const openVerification = (address: string, message: string, kind: NoticeKind = 'info', wait = 0) => {
    setEmail(address.trim());
    setCode('');
    setMode('verify');
    setNotice({ text: message, kind });
    setCooldown(wait);
  };

  const onLogin = async () => {
    if (!email.trim() || !password) return setNotice({ text: 'Введи email і пароль.', kind: 'error' });
    setBusy(true);
    setNotice(null);
    try {
      await login(email.trim(), password);
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 403) {
        openVerification(email, 'Цю адресу ще не підтверджено. Введи код із листа або надішли його повторно.');
      } else {
        setNotice({ text: error instanceof Error ? error.message : 'Не вдалося увійти.', kind: 'error' });
      }
    } finally { setBusy(false); }
  };

  const onRegister = async () => {
    const cleanedEmail = email.trim();
    const cleanedTag = userTag.trim().replace(/^@+/, '');
    if (!name.trim() || !cleanedEmail || !phoneNumber.trim() || !cleanedTag || !password) {
      return setNotice({ text: 'Заповни всі поля, щоб створити акаунт.', kind: 'error' });
    }
    setBusy(true);
    setNotice(null);
    try {
      await register({
        Name: name.trim(), Email: cleanedEmail, PhoneNumber: phoneNumber.trim(),
        UserTag: cleanedTag, Password: password,
      });
      openVerification(cleanedEmail, 'Ми надіслали код на пошту. Введи його тут, щоб підтвердити акаунт.', 'success', 60);
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 503) {
        openVerification(cleanedEmail, 'Акаунт створено, але лист не вдалося відправити. Перевір SMTP-налаштування; повторний запит буде доступний за хвилину.', 'error', 60);
      } else {
        setNotice({ text: error instanceof Error ? error.message : 'Не вдалося створити акаунт.', kind: 'error' });
      }
    } finally { setBusy(false); }
  };

  const onVerify = async () => {
    if (!/^\d{6}$/.test(code)) return setNotice({ text: 'Введи 6 цифр із листа.', kind: 'error' });
    setBusy(true);
    setNotice(null);
    try {
      await verifyEmail(email, code);
      setPassword('');
      setMode('login');
      setNotice({ text: 'Email підтверджено. Тепер увійди в акаунт.', kind: 'success' });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : 'Код не підійшов.', kind: 'error' });
    } finally { setBusy(false); }
  };

  const onResend = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await resendVerification(email);
      setNotice({ text: 'Якщо акаунт існує і не підтверджений, новий код уже надіслано.', kind: 'success' });
      setCooldown(60);
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 429) {
        setNotice({ text: 'Зачекай хвилину перед повторним запитом коду.', kind: 'error' });
        setCooldown(60);
      } else if (error instanceof ApiError && error.statusCode === 503) {
        setNotice({ text: 'Сервер не зміг відправити лист. Перевір SMTP-налаштування та спробуй ще раз за хвилину.', kind: 'error' });
        setCooldown(60);
      } else {
        setNotice({ text: error instanceof Error ? error.message : 'Не вдалося надіслати код.', kind: 'error' });
      }
    } finally { setBusy(false); }
  };

  const returnToLogin = () => {
    setMode('login');
    setPassword('');
    setNotice(null);
  };

  const title = mode === 'verify' ? 'Перевір пошту' : mode === 'register' ? 'Створи акаунт' : 'Раді бачити знову';
  const subtitle = mode === 'verify'
    ? 'Ми захищаємо акаунти підтвердженням адреси.'
    : mode === 'register' ? 'Кілька деталей — і можна спілкуватися.' : 'Увійди, щоб продовжити спілкування.';

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.topBar}>
            <View style={styles.brandRow}>
              <View style={styles.brandMark}><Text style={styles.brandMarkText}>т</Text></View>
              <Text style={styles.brandName}>телеграма</Text>
            </View>
            <Pressable style={styles.settingsButton} onPress={() => { setApiDraft(apiUrl); setShowApiSettings(true); }}>
              <Text style={styles.settingsIcon}>⚙</Text>
            </Pressable>
          </View>

          <View style={styles.hero}>
            <View style={styles.heroOrb} />
            <Text style={styles.eyebrow}>ПРИВАТНІ РОЗМОВИ · ШВИДКО · ПРОСТО</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>

          <View style={styles.card}>
            {mode !== 'verify' && (
              <View style={styles.segment}>
                <Pressable onPress={() => { setMode('login'); setNotice(null); }} style={[styles.segmentButton, mode === 'login' && styles.segmentActive]}>
                  <Text style={[styles.segmentText, mode === 'login' && styles.segmentTextActive]}>Вхід</Text>
                </Pressable>
                <Pressable onPress={() => { setMode('register'); setNotice(null); }} style={[styles.segmentButton, mode === 'register' && styles.segmentActive]}>
                  <Text style={[styles.segmentText, mode === 'register' && styles.segmentTextActive]}>Реєстрація</Text>
                </Pressable>
              </View>
            )}

            {notice && <View style={[styles.notice, notice.kind === 'error' && styles.noticeError, notice.kind === 'success' && styles.noticeSuccess]}><Text style={styles.noticeText}>{notice.text}</Text></View>}

            {mode === 'login' && <>
              <Field label="EMAIL" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
              <Field label="ПАРОЛЬ" value={password} onChangeText={setPassword} placeholder="Твій пароль" secureTextEntry autoComplete="current-password" />
              <ActionButton title="Увійти в акаунт" onPress={onLogin} loading={busy} />
            </>}

            {mode === 'register' && <>
              <Field label="ТВОЄ ІМ’Я" value={name} onChangeText={setName} placeholder="Олена" autoCapitalize="words" />
              <Field label="EMAIL" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
              <Field label="ТЕЛЕФОН" value={phoneNumber} onChangeText={setPhoneNumber} placeholder="+380…" keyboardType="phone-pad" />
              <Field label="ТЕГ" value={userTag} onChangeText={setUserTag} placeholder="@username" autoCapitalize="none" />
              <Field label="ПАРОЛЬ" value={password} onChangeText={setPassword} placeholder="7–20 символів" secureTextEntry autoComplete="new-password" />
              <ActionButton title="Створити акаунт" onPress={onRegister} loading={busy} />
            </>}

            {mode === 'verify' && <>
              <View style={styles.emailPill}><Text style={styles.emailIcon}>✉</Text><Text style={styles.emailValue} numberOfLines={1}>{email}</Text></View>
              <Field label="КОД ІЗ ЛИСТА" value={code} onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" />
              <Text style={styles.codeHint}>Код дійсний 10 хвилин. Перевір також папку «Спам».</Text>
              <ActionButton title="Підтвердити email" onPress={onVerify} loading={busy} />
              <Pressable disabled={busy || cooldown > 0} onPress={onResend} style={styles.secondaryButton}>
                <Text style={[styles.secondaryText, (busy || cooldown > 0) && styles.disabledText]}>{cooldown > 0 ? `Надіслати повторно через ${cooldown} с` : 'Надіслати код ще раз'}</Text>
              </Pressable>
              <Pressable onPress={returnToLogin} style={styles.backButton}><Text style={styles.backText}>← Повернутися до входу</Text></Pressable>
            </>}

            <View style={styles.secureNote}><Text style={styles.secureDot}>●</Text><Text style={styles.secureText}>З’єднання з API: {apiUrl.replace(/^https?:\/\//, '')}</Text></View>
          </View>
          <Text style={styles.footer}>Продовжуючи, ти погоджуєшся з правилами спільноти Телеграма.</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal transparent visible={showApiSettings} animationType="fade" onRequestClose={() => setShowApiSettings(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Підключення до API</Text>
            <Text style={styles.modalHint}>Android-емулятор: http://10.0.2.2:5022{ '\n' }iOS Simulator: http://localhost:5022{ '\n' }Телефон: IP-адреса комп’ютера в локальній мережі.</Text>
            <Field label="BASE URL" value={apiDraft} onChangeText={setApiDraft} placeholder="http://192.168.1.10:5022" autoCapitalize="none" />
            <ActionButton title="Зберегти адресу" onPress={async () => {
              try { await updateApiUrl(apiDraft); setShowApiSettings(false); setNotice({ text: 'Адресу API збережено.', kind: 'success' }); }
              catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Некоректна адреса.', kind: 'error' }); }
            }} />
            <Pressable onPress={() => setShowApiSettings(false)} style={styles.backButton}><Text style={styles.backText}>Скасувати</Text></Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  return <View style={styles.fieldWrap}><Text style={styles.fieldLabel}>{label}</Text><TextInput {...inputProps} placeholderTextColor={colors.faint} style={[styles.input, inputProps.keyboardType === 'number-pad' && styles.codeInput]} selectionColor={colors.blueBright} /></View>;
}

function ActionButton({ title, onPress, loading }: { title: string; onPress: () => void | Promise<void>; loading?: boolean }) {
  return <Pressable onPress={onPress} disabled={loading} style={({ pressed }) => [styles.actionButton, pressed && styles.buttonPressed, loading && styles.buttonDisabled]}>
    {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.actionText}>{title}<Text style={styles.actionArrow}>  →</Text></Text>}
  </Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 }, scroll: { flexGrow: 1, paddingHorizontal: 22, paddingBottom: 32 },
  topBar: { height: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 35, height: 35, borderRadius: 12, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' }, brandMarkText: { color: colors.white, fontSize: 22, fontWeight: '900' }, brandName: { color: colors.text, fontSize: 18, fontWeight: '800', letterSpacing: 0.2 },
  settingsButton: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }, settingsIcon: { color: colors.muted, fontSize: 19 },
  hero: { paddingTop: 28, paddingBottom: 26, position: 'relative' }, heroOrb: { position: 'absolute', top: 10, right: -20, width: 130, height: 130, borderRadius: 65, backgroundColor: colors.blueTint, opacity: 0.5 },
  eyebrow: { color: colors.blueBright, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 13 }, title: { color: colors.text, fontSize: 34, lineHeight: 39, fontWeight: '800', letterSpacing: -0.7 }, subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 10, maxWidth: 310 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: 18, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  segment: { flexDirection: 'row', padding: 4, borderRadius: 14, backgroundColor: colors.background, marginBottom: 18 }, segmentButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 11 }, segmentActive: { backgroundColor: colors.surfaceSoft }, segmentText: { color: colors.muted, fontSize: 13, fontWeight: '700' }, segmentTextActive: { color: colors.text },
  notice: { borderWidth: 1, borderColor: '#3E526B', backgroundColor: '#14263B', borderRadius: 12, padding: 12, marginBottom: 15 }, noticeError: { borderColor: '#693B4A', backgroundColor: '#321C29' }, noticeSuccess: { borderColor: '#256452', backgroundColor: '#102D2A' }, noticeText: { color: colors.text, fontSize: 13, lineHeight: 19 },
  fieldWrap: { marginBottom: 14 }, fieldLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginBottom: 7 }, input: { minHeight: 50, paddingHorizontal: 14, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: '#091625', color: colors.text, fontSize: 15 }, codeInput: { fontSize: 26, fontWeight: '800', letterSpacing: 9, textAlign: 'center' },
  actionButton: { height: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blue, borderRadius: 14, marginTop: 5 }, buttonPressed: { opacity: 0.86, transform: [{ scale: 0.99 }] }, buttonDisabled: { opacity: 0.65 }, actionText: { color: colors.white, fontSize: 15, fontWeight: '800' }, actionArrow: { color: '#C8E0FF', fontSize: 17 },
  emailPill: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: '#091625', marginBottom: 17 }, emailIcon: { fontSize: 15, color: colors.blueBright }, emailValue: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '600' }, codeHint: { marginTop: -4, marginBottom: 12, color: colors.faint, fontSize: 11, lineHeight: 17 },
  secondaryButton: { paddingVertical: 14, alignItems: 'center' }, secondaryText: { color: colors.blueBright, fontSize: 13, fontWeight: '700' }, disabledText: { color: colors.faint }, backButton: { paddingVertical: 12, alignItems: 'center' }, backText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  secureNote: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 16, marginTop: 4, borderTopWidth: 1, borderTopColor: colors.border }, secureDot: { color: colors.green, fontSize: 8 }, secureText: { flex: 1, color: colors.faint, fontSize: 10 }, footer: { textAlign: 'center', color: colors.faint, fontSize: 11, lineHeight: 17, paddingTop: 18, paddingHorizontal: 8 },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: 'rgba(0,0,0,0.7)' }, modalCard: { padding: 20, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, modalTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: 10 }, modalHint: { color: colors.muted, fontSize: 12, lineHeight: 19, marginBottom: 18 },
});
