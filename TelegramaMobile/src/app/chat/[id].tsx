import { HubConnection, HubConnectionBuilder, HttpTransportType, LogLevel } from '@microsoft/signalr';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { getApiUrl } from '../../lib/api';
import { getMessages, ChatMessage } from '../../lib/chatApi';
import { colors } from '../../theme/colors';

export default function ChatScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const chatId = Array.isArray(params.id) ? params.id[0] : params.id;
  const chatName = Array.isArray(params.name) ? params.name[0] : params.name;
  const { token, user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [connectionLabel, setConnectionLabel] = useState('Підключення…');
  const [error, setError] = useState('');
  const connectionRef = useRef<HubConnection | null>(null);

  useEffect(() => {
    if (!token || !chatId) return;
    let active = true;
    void getMessages(token, chatId)
      .then(history => active && setMessages(history))
      .catch(reason => active && setError(reason instanceof Error ? reason.message : 'Не вдалося завантажити історію.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [token, chatId]);

  useEffect(() => {
    if (!token || !chatId) return;
    let active = true;
    const connection = new HubConnectionBuilder()
      .withUrl(`${getApiUrl()}/hubs/chat`, {
        accessTokenFactory: () => token,
        transport: HttpTransportType.WebSockets,
        skipNegotiation: true,
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();
    connectionRef.current = connection;

    connection.on('ReceiveMessage', (message: ChatMessage) => {
      if (!active || message.chatId.toLowerCase() !== chatId.toLowerCase()) return;
      setMessages(current => current.some(item => item.id === message.id) ? current : [...current, message]);
    });
    connection.onreconnecting(() => active && setConnectionLabel('Перепідключення…'));
    connection.onreconnected(async () => {
      if (!active) return;
      setConnectionLabel('На зв’язку');
      try { await connection.invoke('JoinRoom', chatId); } catch { /* server re-joins groups on reconnect */ }
    });
    connection.onclose(() => active && setConnectionLabel('Немає з’єднання'));

    connection.start()
      .then(async () => {
        if (!active) return;
        setConnectionLabel('На зв’язку');
        await connection.invoke('JoinRoom', chatId);
      })
      .catch(reason => {
        if (!active) return;
        setConnectionLabel('Не підключено');
        setError(reason instanceof Error ? reason.message : 'Не вдалося підключити SignalR.');
      });

    return () => {
      active = false;
      connection.off('ReceiveMessage');
      connectionRef.current = null;
      void connection.stop();
    };
  }, [token, chatId]);

  const sortedMessages = useMemo(() => [...messages].reverse(), [messages]);

  const send = useCallback(async () => {
    const cleanText = text.trim();
    const connection = connectionRef.current;
    if (!cleanText || cleanText.length > 2000 || !connection || connection.state !== 'Connected') {
      if (!connection || connection.state !== 'Connected') setError('Зараз немає з’єднання з чатом.');
      return;
    }
    setSending(true);
    setError('');
    try {
      await connection.invoke('SendToRoom', chatId, cleanText);
      setText('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося надіслати повідомлення.');
    } finally { setSending(false); }
  }, [text, chatId]);

  if (!token) {
    router.replace('/');
    return null;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 4 : 0}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.backIcon}>‹</Text></Pressable>
          <View style={styles.headerAvatar}><Text style={styles.headerAvatarText}>{(chatName || 'T')[0].toUpperCase()}</Text></View>
          <View style={styles.headerCopy}><Text style={styles.headerName} numberOfLines={1}>{chatName || 'Розмова'}</Text><View style={styles.presenceRow}><View style={[styles.presenceDot, connectionLabel === 'На зв’язку' ? styles.presenceOnline : styles.presenceOffline]} /><Text style={styles.presenceText}>{connectionLabel}</Text></View></View>
          <Pressable style={styles.moreButton}><Text style={styles.moreIcon}>···</Text></Pressable>
        </View>

        {error ? <Pressable onPress={() => setError('')} style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text><Text style={styles.errorClose}>×</Text></Pressable> : null}

        <View style={styles.dayDivider}><View style={styles.dayLine} /><Text style={styles.dayLabel}>ПОВІДОМЛЕННЯ</Text><View style={styles.dayLine} /></View>

        {loading ? <View style={styles.loading}><ActivityIndicator color={colors.blue} /><Text style={styles.loadingText}>Завантажую історію…</Text></View> : (
          <FlatList
            style={styles.messages}
            contentContainerStyle={messages.length ? styles.messageList : styles.messageEmpty}
            data={sortedMessages}
            inverted
            keyExtractor={item => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => <MessageBubble message={item} mine={item.memberName === user?.name} />}
            ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyIcon}>✦</Text><Text style={styles.emptyTitle}>Почни розмову</Text><Text style={styles.emptyCopy}>Тут з’являться повідомлення цього чату.</Text></View>}
          />
        )}

        <View style={styles.composerWrap}>
          <View style={styles.composer}>
            <Pressable style={styles.attachButton}><Text style={styles.attachText}>＋</Text></Pressable>
            <TextInput
              value={text}
              onChangeText={value => setText(value.slice(0, 2000))}
              placeholder="Напиши повідомлення…"
              placeholderTextColor={colors.faint}
              style={styles.messageInput}
              multiline
              maxLength={2000}
              returnKeyType="default"
              blurOnSubmit={false}
            />
            <Pressable disabled={!text.trim() || sending} onPress={send} style={[styles.sendButton, (!text.trim() || sending) && styles.sendDisabled]}>
              {sending ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.sendIcon}>↑</Text>}
            </Pressable>
          </View>
          <Text style={styles.composerHint}>{text.length}/2000 · повідомлення зберігаються на сервері</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageBubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const time = new Date(message.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return <View style={[styles.messageRow, mine && styles.messageRowMine]}>
    {!mine && <View style={styles.senderAvatar}><Text style={styles.senderAvatarText}>{(message.memberName || 'T')[0].toUpperCase()}</Text></View>}
    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
      {!mine && <Text style={styles.senderName}>{message.memberName}</Text>}
      <Text style={styles.messageText}>{message.text}</Text>
      <View style={styles.messageMeta}><Text style={styles.messageTime}>{time}</Text>{mine && <Text style={styles.messageCheck}>✓✓</Text>}</View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 },
  header: { minHeight: 66, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }, backButton: { width: 35, height: 42, alignItems: 'center', justifyContent: 'center' }, backIcon: { color: colors.blueBright, fontSize: 37, lineHeight: 40, fontWeight: '300' }, headerAvatar: { width: 41, height: 41, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#254778', marginRight: 10 }, headerAvatarText: { color: colors.white, fontSize: 15, fontWeight: '800' }, headerCopy: { flex: 1 }, headerName: { color: colors.text, fontSize: 15, fontWeight: '800' }, presenceRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }, presenceDot: { width: 6, height: 6, borderRadius: 3 }, presenceOnline: { backgroundColor: colors.green }, presenceOffline: { backgroundColor: colors.amber }, presenceText: { color: colors.muted, fontSize: 10 }, moreButton: { width: 34, alignItems: 'center', justifyContent: 'center' }, moreIcon: { color: colors.muted, fontSize: 22, fontWeight: '800' },
  errorBanner: { flexDirection: 'row', alignItems: 'center', margin: 12, padding: 11, borderRadius: 11, backgroundColor: '#321C29', borderWidth: 1, borderColor: '#693B4A' }, errorText: { flex: 1, color: '#FFD5D8', fontSize: 12, lineHeight: 17 }, errorClose: { color: colors.muted, fontSize: 18, paddingLeft: 8 }, dayDivider: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16 }, dayLine: { height: 1, flex: 1, backgroundColor: colors.border }, dayLabel: { color: colors.faint, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }, loadingText: { color: colors.muted, fontSize: 12 }, messages: { flex: 1 }, messageList: { paddingHorizontal: 13, paddingBottom: 15 }, messageEmpty: { flexGrow: 1, justifyContent: 'flex-end', paddingBottom: 20 }, messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 7, marginTop: 12 }, messageRowMine: { justifyContent: 'flex-end' }, senderAvatar: { width: 26, height: 26, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft, marginBottom: 2 }, senderAvatarText: { color: colors.blueBright, fontSize: 10, fontWeight: '800' }, bubble: { maxWidth: '82%', paddingHorizontal: 12, paddingTop: 9, paddingBottom: 6, borderRadius: 16 }, bubbleMine: { borderBottomRightRadius: 5, backgroundColor: '#1F5FAE' }, bubbleOther: { borderBottomLeftRadius: 5, backgroundColor: colors.surfaceRaised }, senderName: { color: '#93C2FF', fontSize: 10, fontWeight: '800', marginBottom: 3 }, messageText: { color: colors.text, fontSize: 14, lineHeight: 20 }, messageMeta: { flexDirection: 'row', justifyContent: 'flex-end', gap: 5, marginTop: 4 }, messageTime: { color: '#BCD0E5', fontSize: 9 }, messageCheck: { color: '#A8D5FF', fontSize: 9, fontWeight: '800' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', transform: [{ scaleY: -1 }] }, emptyIcon: { color: colors.blueBright, fontSize: 30, marginBottom: 11 }, emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '800' }, emptyCopy: { color: colors.muted, fontSize: 12, marginTop: 6 },
  composerWrap: { paddingHorizontal: 13, paddingTop: 10, paddingBottom: 5, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }, composer: { flexDirection: 'row', alignItems: 'flex-end', minHeight: 48, paddingHorizontal: 5, paddingVertical: 5, borderRadius: 15, backgroundColor: '#091625', borderWidth: 1, borderColor: colors.border, gap: 5 }, attachButton: { width: 35, height: 35, alignItems: 'center', justifyContent: 'center' }, attachText: { color: colors.faint, fontSize: 25, lineHeight: 30 }, messageInput: { flex: 1, minHeight: 36, maxHeight: 110, paddingHorizontal: 4, paddingTop: 8, paddingBottom: 7, color: colors.text, fontSize: 14 }, sendButton: { width: 37, height: 37, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blue }, sendDisabled: { backgroundColor: colors.surfaceSoft }, sendIcon: { color: colors.white, fontSize: 22, lineHeight: 25, fontWeight: '800' }, composerHint: { color: colors.faint, textAlign: 'right', fontSize: 9, marginTop: 5, marginRight: 2 },
});
