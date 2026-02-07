
import { supabase } from './supabaseClient';
import { Message, MessageType } from '../types';

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
