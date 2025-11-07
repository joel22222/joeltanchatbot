import { useRef, useState, useEffect, useCallback } from "react"; 
import { useChat } from "../hooks/useChat";

export const UI = ({ hidden, ...props }) => {
  const input = useRef();
  const { chat, loading, cameraZoomed, setCameraZoomed, message } = useChat();
  const inactivityTimeout = useRef();
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const [inputValue, setInputValue] = useState("");

  // Chat history state - Initialize with welcome message
  const [chatHistory, setChatHistory] = useState([
    { role: "bot", content: "Welcome to People Profilers! How can I assist you today?" }
  ]);

  // Chat container ref for auto-scrolling
  const chatContainerRef = useRef(null);

  // Auto-scroll to bottom when chat history updates
  useEffect(() => {
    if (chatContainerRef.current) {
      setTimeout(() => {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }, 0);
    }
  }, [chatHistory]);

  // Voice input setup
  const startListening = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!recognitionRef.current) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = "en-US";

      recognitionRef.current.onstart = () => setListening(true);

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript.trim();
        setListening(false);
        if (transcript) sendMessage(transcript); 
      };

      recognitionRef.current.onerror = (event) => {
        setListening(false);
        alert(`Speech recognition error: ${event.error}`);
      };

      recognitionRef.current.onend = () => setListening(false);
    }

    try {
      setListening(true);
      recognitionRef.current.start();
    } catch (error) {
      setListening(false);
      alert("Error starting speech recognition: " + error.message);
    }
  };

  // Reset inactivity timer (60s + reload)
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimeout.current) clearTimeout(inactivityTimeout.current);
    inactivityTimeout.current = setTimeout(() => window.location.reload(), 600000);
  }, []);

  // Set up event listeners for user activity
  useEffect(() => {
    resetInactivityTimer();
    const events = ["mousemove", "keydown", "mousedown", "touchstart", "click"];
    const handleActivity = (e) => {
      resetInactivityTimer();
      if (e.type === "mousemove" && e.buttons > 0) setCameraZoomed(false);
    };
    events.forEach((event) => window.addEventListener(event, handleActivity));
    return () => {
      if (inactivityTimeout.current) clearTimeout(inactivityTimeout.current);
      events.forEach((event) => window.removeEventListener(event, handleActivity));
    };
  }, [resetInactivityTimer, setCameraZoomed]);

  // Send message
  const sendMessage = (overrideText = null) => {
    const text = overrideText ? overrideText.trim() : inputValue.trim();
    if (!loading && !message && text) {
      setChatHistory((prev) => [...prev, { role: "user", content: text }].slice(-6));
      chat(text).then((botReply) => {
        setChatHistory((prev) => [...prev, { role: "bot", content: botReply }].slice(-6));
      });
      if (!overrideText) setInputValue(""); 
      resetInactivityTimer();
    }
  };

  if (hidden) return null;

  // Function to render message text with clickable links
  const renderMessageContent = (text) => {
    return text.split(/(https?:\/\/[^\s]+)/g).map((part, idx) =>
      /https?:\/\/[^\s]+/.test(part) ? (
        <a key={idx} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">
          {part}
        </a>
      ) : (
        part
      )
    );
  };

  return (
    <div className="fixed inset-0 z-10 flex flex-col">
      {/* Avatar Area - Top 40% */}
      <div className="h-[40vh] relative pointer-events-none">
        {/* Top left header */}
        <div className="absolute top-4 left-4 pointer-events-none">
          <div className="bg-white/80 backdrop-blur-sm rounded-lg px-3 py-2 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
                <img src="/textures/peopleprofilers.png" alt="People Profilers Avatar" className="w-full h-full object-cover"/>
              </div>
              <div className="text-sm font-medium text-gray-700">Emma</div>
              <div className="text-xs text-gray-500">AI Assistant</div>
            </div>
          </div>
        </div>
      </div>

      {/* Interface Area - Bottom 60% */}
      <div className="h-[60vh] bg-gradient-to-b from-sky-50 to-white p-4 flex flex-col min-h-0">
        {/* Chat History */}
        <div className="flex-1 mb-3 min-h-0">
          <div
            className="bg-white rounded-lg shadow-md p-3 h-full flex flex-col relative"
            style={{
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              backgroundSize: "120px",
              opacity: 0.95
            }}
          >
            <h3 className="text-sm font-semibold text-gray-700 mb-2 border-b border-gray-200 pb-1 flex-shrink-0">Conversation</h3>
            <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-300 hover:scrollbar-thumb-gray-400" ref={chatContainerRef} style={{ scrollbarWidth: 'thin', scrollbarColor: '#d1d5db transparent' }}>
              <div className="space-y-2">
                {chatHistory.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "bot" && (
                      <div className="flex items-start gap-2 max-w-xs">
                        <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 mt-1">
                          <img src="/textures/avatar-face.png" alt="Bot Avatar" className="w-full h-full object-cover"/>
                        </div>
                        <div className="flex flex-col">
                          <div className="text-xs text-gray-600 mb-1 font-medium">Emma • AI Assistant</div>
                          <div className="bg-gray-200 text-gray-800 px-3 py-2 rounded-lg">
                            <p className="text-xs break-words">{renderMessageContent(msg.content)}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {msg.role === "user" && (
                      <div className="bg-sky-500 text-white px-3 py-2 rounded-lg max-w-xs">
                        <p className="text-xs break-words">{msg.content}</p>
                      </div>
                    )}
                  </div>
                ))}

                {/* Typing indicator (bouncing dots) */}
                {loading && (
                  <div className="flex justify-start">
                    <div className="flex items-start gap-2 max-w-xs">
                      <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 mt-1">
                        <img src="/textures/avatar-face.png" alt="Bot Avatar" className="w-full h-full object-cover"/>
                      </div>
                      <div className="flex flex-col">
                        <div className="text-xs text-gray-600 mb-1 font-medium">Emma • AI Assistant</div>
                        <div className="bg-gray-200 text-gray-800 px-3 py-2 rounded-lg flex items-center space-x-1">
                          <span className="w-2 h-2 bg-gray-600 rounded-full animate-bounce"></span>
                          <span className="w-2 h-2 bg-gray-600 rounded-full [animation-delay:0.2s] animate-bounce"></span>
                          <span className="w-2 h-2 bg-gray-600 rounded-full [animation-delay:0.4s] animate-bounce"></span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Input Area */}
        <div className="bg-white rounded-lg shadow-lg p-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button type="button" aria-label={listening ? "Stop listening" : "Start voice input"} onClick={() => {
                if (listening && recognitionRef.current) recognitionRef.current.stop();
                else if (!listening) startListening();
              }} className={`p-2 rounded-lg flex items-center justify-center transition-all duration-200 flex-shrink-0 ${listening ? "bg-red-500 text-white animate-pulse shadow-lg" : "bg-gray-100 hover:bg-gray-200 text-gray-700"}`}>
              <img src="/textures/mic.png" alt="Mic" className="w-4 h-4"/>
            </button>

            <input className="flex-1 placeholder:text-gray-500 placeholder:italic p-2 rounded-lg border border-gray-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-200 focus:outline-none text-sm min-w-0"
              placeholder="Ask me anything..."
              ref={input}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onFocus={() => resetInactivityTimer()}
              onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
