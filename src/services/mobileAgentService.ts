import { API_BASE_URL } from '../constants/api';

export interface MobileAgentChatPayload {
  message?: string;
  audio_base64?: string;
  chat_history?: { role: string; text: string }[];
  customer_id?: number;
  phone?: string;
  restaurant_id?: number;
  screen?: { route: string; name: string };
  app_context?: Record<string, any>;
  cart?: Record<string, any>[];
}

export const mobileAgentApi = {
  chat: async (payload: MobileAgentChatPayload) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/public/mcp/mobile-customer-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('Agent API Failed:', response.status, errText);
        throw new Error('Failed to communicate with voice agent');
      }

      return await response.json();
    } catch (error) {
      console.error('[mobileAgentApi.chat] Error:', error);
      throw error;
    }
  }
};
