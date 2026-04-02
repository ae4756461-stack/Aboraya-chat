import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { MapPin, Search, Send, Loader2, Map, Globe, Navigation, ExternalLink, Menu, Plus, MessageSquare, Moon, Sun, Trash2, X, Mic, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

type Message = {
  id: string;
  role: 'user' | 'model';
  text: string;
  groundingChunks?: any[];
};

type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  mode: 'maps' | 'search';
  updatedAt: number;
};

export default function App() {
  // --- State ---
  const [chats, setChats] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem('aboraya_chats');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentChatId, setCurrentChatId] = useState<string | null>(() => {
    const saved = localStorage.getItem('aboraya_chats');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.length > 0 ? parsed[0].id : null;
    }
    return null;
  });
  
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'maps' | 'search'>('maps');
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('aboraya_theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // --- Effects ---
  useEffect(() => {
    localStorage.setItem('aboraya_chats', JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    localStorage.setItem('aboraya_theme', isDarkMode ? 'dark' : 'light');
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    const chat = chats.find(c => c.id === currentChatId);
    if (chat) {
      setMode(chat.mode);
    }
  }, [currentChatId, chats]);

  const currentChat = chats.find(c => c.id === currentChatId);
  const currentMessages = currentChat ? currentChat.messages : [{
    id: 'welcome',
    role: 'model',
    text: 'Hi! I am aBoRaYa chat. I can help you find places using Google Maps or search the web for up-to-date information. What are you looking for today?'
  }];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentMessages]);

  // --- Location ---
  const requestLocation = () => {
    setIsLocating(true);
    setLocationError(null);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          setIsLocating(false);
        },
        (error) => {
          console.error('Error getting location:', error);
          setLocationError('Could not get location. Please enable location permissions.');
          setIsLocating(false);
        }
      );
    } else {
      setLocationError('Geolocation is not supported by your browser.');
      setIsLocating(false);
    }
  };

  useEffect(() => {
    if (mode === 'maps' && !location && !locationError) {
      requestLocation();
    }
  }, [mode]);

  // --- Actions ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64data = (reader.result as string).split(',')[1];
          await transcribeAudio(base64data, audioBlob.type);
        };
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (base64Audio: string, mimeType: string) => {
    setIsTranscribing(true);
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'Transcribe this audio accurately. Only output the transcribed text, without any extra commentary or formatting.' },
              { inlineData: { data: base64Audio, mimeType } }
            ]
          }
        ]
      });
      
      const transcription = response.text?.trim();
      if (transcription) {
        setInput(prev => prev + (prev ? ' ' : '') + transcription);
      }
    } catch (error) {
      console.error("Transcription error:", error);
    } finally {
      setIsTranscribing(false);
    }
  };

  const createNewChat = () => {
    setCurrentChatId(null);
    setMode('maps');
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const deleteChat = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newChats = chats.filter(c => c.id !== id);
    setChats(newChats);
    if (currentChatId === id) {
      setCurrentChatId(newChats.length > 0 ? newChats[0].id : null);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setInput('');
    setIsLoading(true);

    let activeChatId = currentChatId;
    let activeChats = [...chats];

    // Create new chat if none exists
    if (!activeChatId) {
      const newChat: ChatSession = {
        id: Date.now().toString(),
        title: userText.slice(0, 30) + (userText.length > 30 ? '...' : ''),
        messages: [{
          id: 'welcome',
          role: 'model',
          text: 'Hi! I am aBoRaYa chat. I can help you find places using Google Maps or search the web for up-to-date information. What are you looking for today?'
        }],
        mode: mode,
        updatedAt: Date.now(),
      };
      activeChats = [newChat, ...activeChats];
      activeChatId = newChat.id;
      setCurrentChatId(activeChatId);
    }

    const chatIndex = activeChats.findIndex(c => c.id === activeChatId);
    if (chatIndex === -1) {
      setIsLoading(false);
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: userText,
    };

    // Update chat with user message
    activeChats[chatIndex] = {
      ...activeChats[chatIndex],
      messages: [...activeChats[chatIndex].messages, userMessage],
      updatedAt: Date.now(),
      title: activeChats[chatIndex].messages.length === 1 ? userText.slice(0, 30) + (userText.length > 30 ? '...' : '') : activeChats[chatIndex].title
    };
    
    // Sort chats by updatedAt
    activeChats.sort((a, b) => b.updatedAt - a.updatedAt);
    setChats(activeChats);

    try {
      const currentChatData = activeChats.find(c => c.id === activeChatId)!;
      const history = currentChatData.messages.filter(m => m.id !== 'welcome').map((msg) => ({
        role: msg.role,
        parts: [{ text: msg.text }],
      }));
      
      const contents = [...history, { role: 'user', parts: [{ text: userMessage.text }] }];

      const config: any = {
        systemInstruction: currentChatData.mode === 'maps' 
          ? "You are aBoRaYa chat, a helpful location assistant. Use Google Maps to find places, restaurants, and answer location-specific questions. Always be concise, friendly, and helpful. Format your responses using Markdown."
          : "You are aBoRaYa chat, a helpful web search assistant. Use Google Search to find up-to-date information and answer general questions. Always be concise, friendly, and helpful. Format your responses using Markdown.",
        tools: currentChatData.mode === 'maps' ? [{ googleMaps: {} }] : [{ googleSearch: {} }],
      };

      if (currentChatData.mode === 'maps' && location) {
        config.toolConfig = {
          retrievalConfig: {
            latLng: {
              latitude: location.latitude,
              longitude: location.longitude,
            },
          },
        };
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents,
        config,
      });

      const modelMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: response.text || 'Sorry, I could not generate a response.',
        groundingChunks: response.candidates?.[0]?.groundingMetadata?.groundingChunks,
      };

      setChats(prevChats => {
        const updatedChats = [...prevChats];
        const idx = updatedChats.findIndex(c => c.id === activeChatId);
        if (idx !== -1) {
          updatedChats[idx] = {
            ...updatedChats[idx],
            messages: [...updatedChats[idx].messages, modelMessage],
            updatedAt: Date.now(),
          };
          updatedChats.sort((a, b) => b.updatedAt - a.updatedAt);
        }
        return updatedChats;
      });

    } catch (error) {
      console.error('Error generating content:', error);
      setChats(prevChats => {
        const updatedChats = [...prevChats];
        const idx = updatedChats.findIndex(c => c.id === activeChatId);
        if (idx !== -1) {
          updatedChats[idx] = {
            ...updatedChats[idx],
            messages: [...updatedChats[idx].messages, {
              id: (Date.now() + 1).toString(),
              role: 'model',
              text: 'Sorry, an error occurred while processing your request. Please try again.',
            }],
            updatedAt: Date.now(),
          };
        }
        return updatedChats;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 overflow-hidden transition-colors duration-200">
      
      {/* Sidebar Overlay (Mobile) */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/50 z-20 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`fixed md:static inset-y-0 left-0 z-30 w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transform transition-transform duration-300 ease-in-out flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-100 dark:bg-indigo-900/50 p-1 rounded-xl">
              <img src="https://api.dicebear.com/9.x/bottts/svg?seed=aBoRaYa&backgroundColor=4f46e5" alt="aBoRaYa Logo" className="w-8 h-8 rounded-lg" referrerPolicy="no-referrer" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">aBoRaYa</h1>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          <button 
            onClick={createNewChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" />
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 space-y-1 pb-4">
          {chats.length === 0 ? (
            <div className="text-center text-slate-500 dark:text-slate-400 text-sm mt-8">
              No previous chats
            </div>
          ) : (
            chats.map(chat => (
              <div 
                key={chat.id}
                onClick={() => {
                  setCurrentChatId(chat.id);
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
                }}
                className={`group flex items-center justify-between px-3 py-3 rounded-xl cursor-pointer transition-colors ${
                  currentChatId === chat.id 
                    ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' 
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <MessageSquare className="w-4 h-4 flex-shrink-0 opacity-70" />
                  <span className="truncate text-sm font-medium">{chat.title}</span>
                </div>
                <button 
                  onClick={(e) => deleteChat(e, chat.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
        
        {/* User Settings / Theme Toggle */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="flex items-center gap-3 w-full px-3 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            {isDarkMode ? 'Light Mode' : 'Dark Mode'}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-lg font-semibold truncate hidden sm:block">
              {currentChat?.title || 'New Chat'}
            </h2>
          </div>
          
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex-shrink-0">
            <button
              onClick={() => setMode('maps')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                mode === 'maps' 
                  ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Map className="w-4 h-4" />
              <span className="hidden sm:inline">Maps</span>
            </button>
            <button
              onClick={() => setMode('search')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                mode === 'search' 
                  ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Globe className="w-4 h-4" />
              <span className="hidden sm:inline">Search</span>
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 scroll-smooth">
          <div className="max-w-3xl mx-auto space-y-6">
            
            {/* Location Status Banner */}
            <AnimatePresence>
              {mode === 'maps' && (
                <motion.div
                  initial={{ opacity: 0, y: -10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -10, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-2xl p-4 text-sm text-indigo-800 dark:text-indigo-300 mb-6">
                    <div className="flex items-center gap-3">
                      {isLocating ? (
                        <Loader2 className="w-5 h-5 animate-spin text-indigo-600 dark:text-indigo-400" />
                      ) : location ? (
                        <Navigation className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      ) : (
                        <MapPin className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      )}
                      <span className="font-medium">
                        {isLocating 
                          ? 'Acquiring your location...' 
                          : location 
                            ? 'Location acquired. Ready to find places nearby.' 
                            : locationError || 'Location needed for best results.'}
                      </span>
                    </div>
                    {!location && !isLocating && (
                      <button 
                        onClick={requestLocation}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors shadow-sm"
                      >
                        Allow
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Messages */}
            <div className="space-y-6 pb-4">
              {currentMessages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center overflow-hidden shadow-sm ${
                    msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-indigo-100 dark:bg-indigo-900/50'
                  }`}>
                    {msg.role === 'user' ? <Search className="w-4 h-4 sm:w-5 sm:h-5" /> : <img src="https://api.dicebear.com/9.x/bottts/svg?seed=aBoRaYa&backgroundColor=4f46e5" alt="AI" className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
                  </div>
                  
                  <div className={`flex flex-col gap-2 max-w-[85%] sm:max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`px-5 py-3.5 rounded-2xl shadow-sm ${
                      msg.role === 'user' 
                        ? 'bg-indigo-600 text-white rounded-tr-sm' 
                        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-tl-sm'
                    }`}>
                      {msg.role === 'user' ? (
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                      ) : (
                        <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none prose-p:leading-relaxed prose-a:text-indigo-600 dark:prose-a:text-indigo-400">
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                        </div>
                      )}
                    </div>

                    {/* Grounding Chunks (Maps or Web) */}
                    {msg.groundingChunks && msg.groundingChunks.length > 0 && (
                      <div className="flex flex-wrap gap-3 mt-2 w-full">
                        {msg.groundingChunks.map((chunk, idx) => {
                          if (chunk.maps) {
                            return (
                              <a 
                                key={idx} 
                                href={chunk.maps.uri} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex flex-col gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm hover:shadow-md transition-all w-full sm:w-[calc(50%-0.375rem)] group"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 line-clamp-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{chunk.maps.title}</h3>
                                  <ExternalLink className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                </div>
                                {chunk.maps.placeAnswerSources?.reviewSnippets && chunk.maps.placeAnswerSources.reviewSnippets.length > 0 && (
                                  <div className="text-sm text-slate-600 dark:text-slate-400 italic border-l-2 border-indigo-200 dark:border-indigo-500/30 pl-3">
                                    "{chunk.maps.placeAnswerSources.reviewSnippets[0]}"
                                  </div>
                                )}
                              </a>
                            );
                          } else if (chunk.web) {
                            return (
                              <a 
                                key={idx} 
                                href={chunk.web.uri} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-sm hover:shadow-md transition-all w-full sm:w-[calc(50%-0.375rem)] group"
                              >
                                <div className="bg-slate-100 dark:bg-slate-700 p-2 rounded-lg group-hover:bg-indigo-50 dark:group-hover:bg-indigo-500/20 transition-colors">
                                  <Globe className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{chunk.web.title}</h3>
                                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{new URL(chunk.web.uri).hostname}</p>
                                </div>
                              </a>
                            );
                          }
                          return null;
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
              
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-4"
                >
                  <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center shadow-sm">
                    <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 dark:text-indigo-400 animate-spin" />
                  </div>
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm rounded-2xl rounded-tl-sm px-5 py-4 flex items-center gap-2">
                    <div className="w-2 h-2 bg-indigo-400 dark:bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-indigo-400 dark:bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-indigo-400 dark:bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>

        {/* Input Area */}
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 p-4">
          <div className="max-w-3xl mx-auto relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isTranscribing ? "Transcribing audio..." : mode === 'maps' ? "Ask about places nearby..." : "Search the web..."}
              disabled={isTranscribing}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl pl-5 pr-24 py-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none min-h-[56px] max-h-32 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 shadow-sm transition-shadow disabled:opacity-50"
              rows={1}
            />
            <div className="absolute right-2.5 bottom-2.5 flex items-center gap-1">
              {isTranscribing ? (
                <div className="p-2 text-indigo-600 dark:text-indigo-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : isRecording ? (
                <button
                  onClick={stopRecording}
                  className="p-2 bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400 rounded-xl hover:bg-red-200 dark:hover:bg-red-500/30 transition-all shadow-sm animate-pulse"
                  title="Stop recording"
                >
                  <Square className="w-5 h-5 fill-current" />
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-xl transition-all"
                  title="Start voice input"
                >
                  <Mic className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading || isTranscribing}
                className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-all shadow-sm"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="max-w-3xl mx-auto mt-3 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              aBoRaYa chat uses Gemini and Google {mode === 'maps' ? 'Maps' : 'Search'}. Responses may not always be accurate.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
