
import { supabase } from './supabaseClient';
import { Message, MessageListItem, MessageType } from '../types';

/**
 * Fetch unread message count for the sidebar badge
 */
export const fetchUnreadMessageCount = async (userId: string, teamId: string): Promise<number> => {
    if (!userId || !teamId) return 0;
    
    const { count, error } = await supabase
        .from('user_messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('team_id', teamId)
        .eq('is_read', false);

    if (error) {
        console.error("Error fetching unread count:", error);
        return 0;
    }
    return count || 0;
};

/**
 * Fetch total message count
 */
export const fetchTotalMessageCount = async (userId: string, teamId: string): Promise<number> => {
    if (!userId || !teamId) return 0;

    const { count, error } = await supabase
        .from('user_messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('team_id', teamId);

    if (error) {
        console.error("Error fetching total message count:", error);
        return 0;
    }
    return count || 0;
};

/**
 * Fetch messages with pagination
 */
export const fetchMessages = async (userId: string, teamId: string, page: number = 0, limit: number = 20): Promise<Message[]> => {
    const from = page * limit;
    const to = from + limit - 1;

    const { data, error } = await supabase
        .from('user_messages')
        .select('*')
        .eq('user_id', userId)
        .eq('team_id', teamId)
        .order('date', { ascending: false }) // Sort by sim date desc
        .order('created_at', { ascending: false }) // Then by creation
        .range(from, to);

    if (error) {
        console.error("Error fetching messages:", error);
        return [];
    }
    return data as Message[];
};

/**
 * Fetch message metadata (no content JSONB) with pagination.
 * Used for the sidebar list where only title/type/date/is_read are needed.
 */
export const fetchMessageList = async (userId: string, teamId: string, page: number = 0, limit: number = 20): Promise<MessageListItem[]> => {
    const from = page * limit;
    const to = from + limit - 1;

    const { data, error } = await supabase
        .from('user_messages')
        .select('id, user_id, team_id, date, type, title, is_read, created_at')
        .eq('user_id', userId)
        .eq('team_id', teamId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to);

    if (error) {
        console.error("Error fetching message list:", error);
        return [];
    }
    return data as MessageListItem[];
};

/**
 * Fetch the content JSONB for a single message by ID.
 * Called on-demand when a message is selected in InboxView.
 */
export const fetchMessageContent = async (messageId: string): Promise<any | null> => {
    const { data, error } = await supabase
        .from('user_messages')
        .select('content')
        .eq('id', messageId)
        .single();

    if (error) {
        console.error("Error fetching message content:", error);
        return null;
    }
    return data?.content ?? null;
};

/**
 * Mark a single message as read
 */
export const markMessageAsRead = async (messageId: string) => {
    const { error } = await supabase
        .from('user_messages')
        .update({ is_read: true })
        .eq('id', messageId);

    if (error) console.error("Error marking message as read:", error);
};

/**
 * Mark all messages as read for the user's team
 */
export const markAllMessagesAsRead = async (userId: string, teamId: string) => {
    const { error } = await supabase
        .from('user_messages')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('team_id', teamId)
        .eq('is_read', false);

    if (error) console.error("Error marking all as read:", error);
};

/**
 * Check if a message of the given type already exists for this user/team
 */
export const hasMessageOfType = async (userId: string, teamId: string, type: MessageType): Promise<boolean> => {
    if (!userId || !teamId) return false;

    const { count, error } = await supabase
        .from('user_messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('team_id', teamId)
        .eq('type', type);

    if (error) {
        console.error("Error checking message existence:", error);
        return false;
    }
    return (count || 0) > 0;
};

/**
 * Send a new message (System -> User)
 * Returns true if successful, false otherwise.
 */
export const sendMessage = async (
    userId: string,
    teamId: string,
    date: string,
    type: MessageType,
    title: string,
    content: any
): Promise<boolean> => {
    if (!userId || !teamId) {
        console.error("sendMessage: Missing userId or teamId");
        return false;
    }

    const { error } = await supabase
        .from('user_messages')
        .insert({
            user_id: userId,
            team_id: teamId,
            date: date,
            type: type,
            title: title,
            content: content,
            is_read: false
        });

    if (error) {
        console.error("Error creating message:", error);
        return false;
    }
    return true;
};

/**
 * Bulk insert messages (for batch season simulation)
 * Inserts in chunks of 50 to avoid payload size limits.
 */
export const bulkSendMessages = async (
    messages: { user_id: string; team_id: string; date: string; type: MessageType; title: string; content: any }[]
): Promise<boolean> => {
    if (messages.length === 0) return true;

    const CHUNK = 50;
    for (let i = 0; i < messages.length; i += CHUNK) {
        const chunk = messages.slice(i, i + CHUNK).map(m => ({
            user_id: m.user_id,
            team_id: m.team_id,
            date: m.date,
            type: m.type,
            title: m.title,
            content: m.content,
            is_read: false,
        }));

        const { error } = await supabase
            .from('user_messages')
            .insert(chunk);

        if (error) {
            console.error("Error bulk inserting messages:", error);
            return false;
        }
    }
    return true;
};
