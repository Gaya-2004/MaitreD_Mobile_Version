import { create } from 'zustand';

export type AgentState = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'ERROR';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: number;
}

interface VoiceAgentStore {
  isVisible: boolean;
  agentState: AgentState;
  messages: ChatMessage[];
  showAgent: () => void;
  hideAgent: () => void;
  setAgentState: (state: AgentState) => void;
  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
}

export const useVoiceAgentStore = create<VoiceAgentStore>((set) => ({
  isVisible: false,
  agentState: 'IDLE',
  messages: [],
  showAgent: () => set({ isVisible: true }),
  hideAgent: () => set({ isVisible: false, agentState: 'IDLE' }),
  setAgentState: (state) => set({ agentState: state }),
  addMessage: (msg) => set((state) => ({
    messages: [
      ...state.messages,
      {
        ...msg,
        id: Math.random().toString(36).substring(7),
        timestamp: Date.now(),
      }
    ]
  })),
  clearMessages: () => set({ messages: [] })
}));
