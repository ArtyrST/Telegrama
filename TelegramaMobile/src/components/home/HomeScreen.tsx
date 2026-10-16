import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, Platform, Pressable, RefreshControl,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChatSummary, createDirect, createGroup, getChats, joinChat, searchUser } from '../../lib/chatApi';
import { useAuth } from '../../context/AuthContext';
import { colors, radii } from '../../theme/colors';

type Sheet = 'new' | 'search' | 'group' | 'join' | 'profile' | null;

export function HomeScreen() {
  const { token, user, logout, apiUrl, updateApiUrl } = useAuth();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [filter, setFilter] = useState<'all' | 'direct' | 'groups'>('all');
  const [tag, setTag] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupType, setGroupType] = useState(0);
  const [joinId, setJoinId] = useState('');
  const [apiDraft, setApiDraft] = useState(apiUrl);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');

  const refresh = useCallback(async (quiet = false) => {
    if (!token) return;
    if (quiet) setRefreshing(true); else setLoading(true);
    try {
      setChats(await getChats(token));
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не вдалося завантажити чати.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    getChats(token)
      .then(items => {
        if (!active) return;
        setChats(items);
        setNotice('');
      })
      .catch(error => active && setNotice(error instanceof Error ? error.message : 'Не вдалося завантажити чати.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [token]);

  const visibleChats = useMemo(() => chats.filter(chat => {
    const direct = chat.chatType === 3;
    const matchesFilter = filter === 'all' || (filter === 'direct' ? direct : !direct);
    return matchesFilter && chat.name.toLowerCase().includes(query.trim().toLowerCase());
  }), [chats, filter, query]);

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    setNotice('');
    try { await action(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Сталася помилка.'); }
    finally { setBusy(false); }
  };

  const onCreateGroup = () => runAction(async () => {
    if (!token) return;
    const cleanName = groupName.trim();
    if (cleanName.length < 3 || cleanName.length > 50) throw new Error('Назва має містити від 3 до 50 символів.');
    await createGroup(token, cleanName, groupType);
    await refresh(true);
    setGroupName('');
    setSheet(null);
    setNotice('Групу створено.');
  });

  const onJoin = () => runAction(async () => {
    if (!token) return;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(joinId.trim())) {
      throw new Error('Введи коректний ID чату у форматі GUID.');
    }
    await joinChat(token, joinId.trim());
    await refresh(true);
    setJoinId('');
    setSheet(null);
    setNotice('Ти приєднався до чату.');
  });

  const onSearch = () => runAction(async () => {
    if (!token) return;
    const cleanTag = tag.trim();
    if (!cleanTag) throw new Error('Введи тег користувача.');
    const found = await searchUser(token, cleanTag);
    await createDirect(token, found.id);
    await refresh(true);
    setTag('');
    setSheet(null);
    setNotice(`Direct-чат із ${found.name} створено або вже існує.`);
  });

  const titleName = user?.name?.split(' ')[0] || 'друже';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>т</Text></View>
          <Text style={styles.brandName}>телеграма</Text>
        </View>
        <Pressable onPress={() => setSheet('profile')} style={styles.profileButton}>
          <Text style={styles.profileInitial}>{(user?.name || user?.email || 'T')[0].toUpperCase()}</Text>
        </Pressable>
      </View>

      <View style={styles.headline}>
        <View><Text style={styles.greeting}>Привіт, {titleName} 👋</Text><Text style={styles.headlineTitle}>Твої розмови</Text></View>
        <Pressable onPress={() => setSheet('new')} style={styles.addButton}><Text style={styles.addButtonText}>＋</Text></Pressable>
      </View>

      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput value={query} onChangeText={setQuery} placeholder="Пошук чатів" placeholderTextColor={colors.faint} style={styles.searchInput} />
        <Pressable onPress={() => setSheet('search')} style={styles.searchPeople}><Text style={styles.searchPeopleText}>Люди</Text></Pressable>
      </View>

      <View style={styles.filterRow}>
        {([['all', 'Усі'], ['direct', 'Особисті'], ['groups', 'Групи']] as const).map(([key, label]) => (
          <Pressable key={key} onPress={() => setFilter(key)} style={[styles.filterChip, filter === key && styles.filterChipActive]}>
            <Text style={[styles.filterText, filter === key && styles.filterTextActive]}>{label}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => refresh(true)} style={styles.refreshButton}><Text style={styles.refreshText}>↻</Text></Pressable>
      </View>

      {notice ? <Pressable onPress={() => setNotice('')} style={styles.notice}><Text style={styles.noticeText}>{notice}</Text><Text style={styles.noticeClose}>×</Text></Pressable> : null}

      {loading ? <View style={styles.loading}><ActivityIndicator color={colors.blue} /><Text style={styles.loadingText}>Завантажую чати…</Text></View> : (
        <FlatList
          data={visibleChats}
          keyExtractor={item => item.id}
          contentContainerStyle={visibleChats.length ? styles.listContent : styles.emptyListContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => refresh(true)} tintColor={colors.blueBright} />}
          renderItem={({ item, index }) => <ChatRow chat={item} index={index} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id, name: item.chatType === 3 && item.name === 'Заглушка' ? 'Особистий чат' : item.name } })} />}
          ListEmptyComponent={<EmptyState onCreate={() => setSheet('new')} onSearch={() => setSheet('search')} />}
        />
      )}

      <View style={styles.bottomBar}>
        <NavItem icon="▣" label="Чати" active onPress={() => {}} />
        <NavItem icon="⌕" label="Знайти" onPress={() => setSheet('search')} />
        <NavItem icon="◉" label="Профіль" onPress={() => setSheet('profile')} />
      </View>

      <Modal transparent visible={sheet !== null} animationType="slide" onRequestClose={() => setSheet(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSheet(null)}>
          <Pressable style={styles.sheet} onPress={event => event.stopPropagation()}>
            <View style={styles.sheetHandle} />
            {sheet === 'new' && <>
              <Text style={styles.sheetTitle}>Нова розмова</Text>
              <Text style={styles.sheetSubtitle}>Почни особистий чат або створи простір для групи.</Text>
              <SheetAction icon="◎" title="Знайти людину" subtitle="Відкрити direct за тегом" onPress={() => setSheet('search')} />
              <SheetAction icon="＋" title="Створити групу" subtitle="Збери друзів в одному чаті" onPress={() => setSheet('group')} />
              <SheetAction icon="↗" title="Приєднатися за ID" subtitle="Введи GUID групового чату" onPress={() => setSheet('join')} />
            </>}

            {sheet === 'search' && <>
              <Text style={styles.sheetTitle}>Знайти людину</Text><Text style={styles.sheetSubtitle}>Введи її Telegrama-тег, наприклад @anna.</Text>
              <Text style={styles.fieldLabel}>ТЕГ КОРИСТУВАЧА</Text>
              <TextInput value={tag} onChangeText={setTag} placeholder="@username" placeholderTextColor={colors.faint} autoCapitalize="none" style={styles.input} />
              <PrimaryButton title="Знайти та відкрити чат" busy={busy} onPress={onSearch} />
            </>}

            {sheet === 'group' && <>
              <Text style={styles.sheetTitle}>Створити групу</Text><Text style={styles.sheetSubtitle}>Після створення ти станеш власником групи.</Text>
              <Text style={styles.fieldLabel}>НАЗВА ГРУПИ</Text>
              <TextInput value={groupName} onChangeText={setGroupName} placeholder="Наприклад, Команда" placeholderTextColor={colors.faint} maxLength={50} style={styles.input} />
              <Text style={[styles.fieldLabel, styles.typeLabel]}>ТИП ГРУПИ</Text>
              <View style={styles.typeRow}>{[['Приватна', 0], ['Публічна', 1], ['За посиланням', 2]].map(([label, value]) => (
                <Pressable key={String(value)} onPress={() => setGroupType(Number(value))} style={[styles.typeChip, groupType === value && styles.typeChipActive]}><Text style={[styles.typeText, groupType === value && styles.typeTextActive]}>{label}</Text></Pressable>
              ))}</View>
              <PrimaryButton title="Створити групу" busy={busy} onPress={onCreateGroup} />
            </>}

            {sheet === 'join' && <>
              <Text style={styles.sheetTitle}>Приєднатися до групи</Text><Text style={styles.sheetSubtitle}>Введи ID групового чату (GUID).</Text>
              <Text style={styles.fieldLabel}>CHAT ID</Text>
              <TextInput value={joinId} onChangeText={setJoinId} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" placeholderTextColor={colors.faint} autoCapitalize="none" style={styles.input} />
              <PrimaryButton title="Приєднатися" busy={busy} onPress={onJoin} />
            </>}

            {sheet === 'profile' && <>
              <Text style={styles.sheetTitle}>Твій профіль</Text>
              <View style={styles.userCard}><Avatar name={user?.name || user?.email || 'T'} index={2} /><View style={styles.userInfo}><Text style={styles.userName}>{user?.name}</Text><Text style={styles.userEmail}>{user?.email}</Text><Text style={styles.userTag}>{user?.userTag}</Text></View></View>
              <Text style={styles.fieldLabel}>АДРЕСА API</Text>
              <TextInput value={apiDraft} onChangeText={setApiDraft} autoCapitalize="none" style={styles.input} />
              <Text style={styles.apiHelp}>Емулятор Android: 10.0.2.2:5022 · Телефон: IP комп’ютера в Wi-Fi.</Text>
              <PrimaryButton title="Зберегти адресу" busy={busy} onPress={() => runAction(async () => { await updateApiUrl(apiDraft); setSheet(null); setNotice('Адресу API збережено. Перезапусти сесію, щоб під’єднатися до іншого сервера.'); })} />
              <Pressable style={styles.logoutButton} onPress={() => { setSheet(null); void logout(); }}><Text style={styles.logoutText}>Вийти з акаунта</Text></Pressable>
            </>}
            {notice && sheet !== 'profile' ? <Text style={styles.sheetError}>{notice}</Text> : null}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function ChatRow({ chat, index, onPress }: { chat: ChatSummary; index: number; onPress: () => void }) {
  const direct = chat.chatType === 3;
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.chatRow, pressed && styles.rowPressed]}>
    <Avatar name={chat.name || 'T'} index={index} direct={direct} />
    <View style={styles.chatInfo}>
      <View style={styles.chatHeading}><Text style={styles.chatName} numberOfLines={1}>{direct && chat.name === 'Заглушка' ? 'Особистий чат' : chat.name}</Text><Text style={styles.chatTime}>{direct ? 'Direct' : `${chat.usersCount} учасн.`}</Text></View>
      <View style={styles.chatSubline}><Text style={styles.chatPreview} numberOfLines={1}>{direct ? 'Особиста розмова' : `${chat.chatType === 1 ? 'Публічна' : chat.chatType === 2 ? 'За посиланням' : 'Приватна'} група`}</Text><View style={styles.chatBadge}><Text style={styles.chatBadgeText}>{direct ? '1:1' : 'ГРУПА'}</Text></View></View>
    </View>
  </Pressable>;
}

function Avatar({ name, index, direct = false }: { name: string; index: number; direct?: boolean }) {
  const fills = ['#254778', '#245A57', '#634777', '#69502B', '#3D4F71'];
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'T';
  return <View style={[styles.avatar, { backgroundColor: fills[index % fills.length] }]}><Text style={styles.avatarText}>{direct ? initials.slice(0, 1) : initials}</Text><View style={styles.onlineDot} /></View>;
}

function EmptyState({ onCreate, onSearch }: { onCreate: () => void; onSearch: () => void }) {
  return <View style={styles.emptyState}><View style={styles.emptyIcon}><Text style={styles.emptyIconText}>✦</Text></View><Text style={styles.emptyTitle}>Тут поки тихо</Text><Text style={styles.emptyCopy}>Знайди друзів або створи першу групу — розмова починається з одного повідомлення.</Text><Pressable onPress={onSearch} style={styles.emptyPrimary}><Text style={styles.emptyPrimaryText}>Знайти людину</Text></Pressable><Pressable onPress={onCreate} style={styles.emptySecondary}><Text style={styles.emptySecondaryText}>Створити групу</Text></Pressable></View>;
}

function NavItem({ icon, label, active, onPress }: { icon: string; label: string; active?: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.navItem}><Text style={[styles.navIcon, active && styles.navActive]}>{icon}</Text><Text style={[styles.navLabel, active && styles.navActive]}>{label}</Text></Pressable>;
}

function SheetAction({ icon, title, subtitle, onPress }: { icon: string; title: string; subtitle: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.sheetAction}><View style={styles.sheetActionIcon}><Text style={styles.sheetActionIconText}>{icon}</Text></View><View style={styles.sheetActionCopy}><Text style={styles.sheetActionTitle}>{title}</Text><Text style={styles.sheetActionSubtitle}>{subtitle}</Text></View><Text style={styles.sheetChevron}>›</Text></Pressable>;
}

function PrimaryButton({ title, busy, onPress }: { title: string; busy: boolean; onPress: () => void }) {
  return <Pressable disabled={busy} onPress={onPress} style={[styles.primaryButton, busy && { opacity: 0.65 }]}>{busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>{title}  →</Text>}</Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  topBar: { height: 58, paddingHorizontal: 21, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 }, brandMark: { width: 33, height: 33, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blue }, brandMarkText: { color: colors.white, fontSize: 21, fontWeight: '900' }, brandName: { color: colors.text, fontSize: 17, fontWeight: '800' }, profileButton: { width: 37, height: 37, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.border }, profileInitial: { color: colors.blueBright, fontSize: 14, fontWeight: '800' },
  headline: { paddingHorizontal: 22, paddingTop: 25, paddingBottom: 19, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }, greeting: { color: colors.muted, fontSize: 13, fontWeight: '600', marginBottom: 7 }, headlineTitle: { color: colors.text, fontSize: 29, fontWeight: '800', letterSpacing: -0.4 }, addButton: { width: 45, height: 45, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blue }, addButtonText: { color: colors.white, fontSize: 27, lineHeight: 30, fontWeight: '400' },
  searchBox: { marginHorizontal: 20, marginBottom: 15, height: 49, borderRadius: 15, paddingLeft: 13, paddingRight: 7, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 8 }, searchIcon: { fontSize: 25, lineHeight: 29, color: colors.faint }, searchInput: { flex: 1, height: 46, color: colors.text, fontSize: 14 }, searchPeople: { borderRadius: 10, backgroundColor: colors.blueTint, paddingHorizontal: 11, paddingVertical: 8 }, searchPeopleText: { color: colors.blueBright, fontSize: 11, fontWeight: '800' },
  filterRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 8, marginBottom: 11 }, filterChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radii.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, filterChipActive: { backgroundColor: colors.blueTint, borderColor: '#2B5B91' }, filterText: { color: colors.muted, fontSize: 11, fontWeight: '700' }, filterTextActive: { color: colors.blueBright }, refreshButton: { marginLeft: 'auto', width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }, refreshText: { color: colors.muted, fontSize: 20 },
  notice: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, padding: 11, borderRadius: 12, backgroundColor: '#14263B', borderWidth: 1, borderColor: colors.border, marginBottom: 5 }, noticeText: { color: colors.text, flex: 1, fontSize: 12 }, noticeClose: { color: colors.muted, fontSize: 18, paddingLeft: 8 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }, loadingText: { color: colors.muted, fontSize: 13 }, listContent: { paddingHorizontal: 17, paddingBottom: 24 }, emptyListContent: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 20 },
  chatRow: { minHeight: 82, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5, borderBottomWidth: 1, borderBottomColor: '#13253A' }, rowPressed: { opacity: 0.75 }, avatar: { width: 53, height: 53, borderRadius: 19, alignItems: 'center', justifyContent: 'center', position: 'relative' }, avatarText: { color: '#E9F2FF', fontSize: 17, fontWeight: '800' }, onlineDot: { position: 'absolute', width: 11, height: 11, borderRadius: 6, right: -1, bottom: -1, borderWidth: 2, borderColor: colors.background, backgroundColor: colors.green }, chatInfo: { flex: 1, marginLeft: 13, paddingVertical: 14 }, chatHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, chatName: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' }, chatTime: { color: colors.faint, fontSize: 10 }, chatSubline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 }, chatPreview: { flex: 1, color: colors.muted, fontSize: 12 }, chatBadge: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7, backgroundColor: colors.surfaceSoft }, chatBadgeText: { color: colors.faint, fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  bottomBar: { height: 66, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }, navItem: { minWidth: 75, alignItems: 'center', gap: 4 }, navIcon: { color: colors.faint, fontSize: 19 }, navLabel: { color: colors.faint, fontSize: 10, fontWeight: '700' }, navActive: { color: colors.blueBright },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 35 }, emptyIcon: { width: 78, height: 78, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blueTint, marginBottom: 22 }, emptyIconText: { color: colors.blueBright, fontSize: 39 }, emptyTitle: { color: colors.text, fontSize: 21, fontWeight: '800' }, emptyCopy: { maxWidth: 285, color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 9, marginBottom: 20 }, emptyPrimary: { width: '100%', alignItems: 'center', paddingVertical: 14, borderRadius: 13, backgroundColor: colors.blue }, emptyPrimaryText: { color: colors.white, fontSize: 13, fontWeight: '800' }, emptySecondary: { paddingVertical: 13 }, emptySecondaryText: { color: colors.blueBright, fontSize: 13, fontWeight: '700' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.62)' }, sheet: { minHeight: 270, maxHeight: '86%', paddingHorizontal: 21, paddingTop: 11, paddingBottom: Platform.OS === 'ios' ? 36 : 24, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 3, backgroundColor: colors.faint, opacity: 0.55, marginBottom: 21 }, sheetTitle: { color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 6 }, sheetSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 20 }, sheetAction: { minHeight: 68, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border }, sheetActionIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: colors.blueTint, alignItems: 'center', justifyContent: 'center' }, sheetActionIconText: { color: colors.blueBright, fontSize: 21 }, sheetActionCopy: { flex: 1, marginLeft: 12 }, sheetActionTitle: { color: colors.text, fontSize: 14, fontWeight: '700' }, sheetActionSubtitle: { color: colors.muted, fontSize: 11, marginTop: 4 }, sheetChevron: { color: colors.faint, fontSize: 24, paddingLeft: 10 }, fieldLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 7, marginTop: 3 }, input: { height: 49, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: '#091625', color: colors.text, fontSize: 14, marginBottom: 16 }, primaryButton: { height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: colors.blue, marginTop: 3 }, primaryButtonText: { color: colors.white, fontSize: 13, fontWeight: '800' }, typeLabel: { marginTop: 0 }, typeRow: { flexDirection: 'row', gap: 7, marginBottom: 15 }, typeChip: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 39, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background }, typeChipActive: { backgroundColor: colors.blueTint, borderColor: colors.blue }, typeText: { color: colors.muted, fontSize: 10, fontWeight: '700' }, typeTextActive: { color: colors.blueBright }, sheetError: { color: colors.red, fontSize: 12, lineHeight: 17, marginTop: 13 },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15, borderRadius: 16, backgroundColor: colors.surfaceRaised, marginBottom: 19 }, userInfo: { flex: 1 }, userName: { color: colors.text, fontSize: 15, fontWeight: '800' }, userEmail: { color: colors.muted, fontSize: 12, marginTop: 3 }, userTag: { color: colors.blueBright, fontSize: 11, marginTop: 4 }, apiHelp: { color: colors.faint, fontSize: 10, lineHeight: 15, marginTop: -8, marginBottom: 13 }, logoutButton: { alignItems: 'center', paddingVertical: 16 }, logoutText: { color: colors.red, fontSize: 13, fontWeight: '700' },
});
