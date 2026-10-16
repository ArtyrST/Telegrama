import { ApiEnvelope, apiRequest, payloadOf } from './api';

export type ChatSummary = {
  id: string;
  name: string;
  chatType: number;
  usersCount: number;
};

export type ChatMessage = {
  id: string;
  chatId: string;
  memberName: string;
  text: string;
  sentAt: string;
};

export type UserSearchResult = {
  id: string;
  name: string;
  userTag: string;
};

function requirePayload<T>(response: ApiEnvelope<T>, errorMessage: string): T {
  const result = payloadOf(response);
  if (result === null) throw new Error(errorMessage);
  return result;
}

export async function getChats(token: string): Promise<ChatSummary[]> {
  const result = await apiRequest<ChatSummary[]>('/api/chats/my', { token });
  return requirePayload(result, 'Список чатів порожній або API не повернув дані.');
}

export async function getMessages(token: string, chatId: string): Promise<ChatMessage[]> {
  const result = await apiRequest<ChatMessage[]>(`/api/chats/${encodeURIComponent(chatId)}/last-messages?limit=50`, { token });
  return requirePayload(result, 'Не вдалося завантажити історію повідомлень.');
}

export async function createGroup(token: string, name: string, chatType: number): Promise<void> {
  await apiRequest<null>('/api/chats/create', { method: 'POST', token, form: { Name: name, ChatType: chatType } });
}

export async function joinChat(token: string, chatId: string): Promise<void> {
  await apiRequest<null>(`/api/chats/join-chat?chatId=${encodeURIComponent(chatId)}`, { method: 'POST', token });
}

export async function searchUser(token: string, tag: string): Promise<UserSearchResult> {
  const result = await apiRequest<UserSearchResult>(`/api/users/by-tag?tag=${encodeURIComponent(tag)}`, { token });
  return requirePayload(result, 'Користувача за цим тегом не знайдено.');
}

export async function createDirect(token: string, guestId: string): Promise<void> {
  await apiRequest<null>('/api/chats/create-direct', { method: 'POST', token, form: { GuestId: guestId } });
}
